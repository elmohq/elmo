import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, organization, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	lastRunKey,
	minCadenceHours,
	parseOrgRunPolicyOverrides,
	parseScrapeTargets,
	resolveTargetRunPolicy,
	selectDueTargets,
	selectTargetsForBrand,
	type OrgRunPolicyOverrides,
} from "@workspace/lib/providers";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import boss from "../boss";

export interface ScheduleMaintenanceData {
	source?: string; // For logging - "scheduled" or "manual"
}

/**
 * Maintenance job that ensures all enabled prompts have scheduled jobs.
 * This is a self-healing mechanism that catches any prompts that fell through
 * the cracks (e.g., due to worker crashes, failed jobs, etc.).
 *
 * Runs every 6 hours via pg-boss schedule.
 */
export async function scheduleMaintenanceJob(jobs: Job<ScheduleMaintenanceData>[]): Promise<void> {
	for (const job of jobs) {
		const source = job.data?.source || "scheduled";
		console.log(`[schedule-maintenance] Starting maintenance check (source: ${source})`);

		try {
			await runMaintenanceCheck();
		} catch (error) {
			console.error("[schedule-maintenance] Maintenance check failed:", error);
			throw error; // Will trigger retry
		}
	}
}

async function runMaintenanceCheck(): Promise<void> {
	// Get all enabled brands
	const enabledBrands = await db.query.brands.findMany({
		where: eq(brands.enabled, true),
	});

	if (enabledBrands.length === 0) {
		console.log("[schedule-maintenance] No enabled brands found");
		return;
	}

	const brandIds = enabledBrands.map((b) => b.id);
	const defaultDelayHours = getDefaultDelayHours();
	const deploymentMode = process.env.DEPLOYMENT_MODE ?? "";
	const brandMap = new Map(enabledBrands.map((b) => [b.id, b]));

	// Get all enabled prompts for enabled brands
	const enabledPrompts = await db.query.prompts.findMany({
		where: and(eq(prompts.enabled, true), inArray(prompts.brandId, brandIds)),
	});

	if (enabledPrompts.length === 0) {
		console.log("[schedule-maintenance] No enabled prompts found");
		return;
	}

	console.log(`[schedule-maintenance] Checking ${enabledPrompts.length} enabled prompts`);

	const allTargets = parseScrapeTargets(process.env.SCRAPE_TARGETS);

	// Batch the cloud org-override lookups into one query over the distinct org ids.
	const orgOverridesMap = new Map<string, OrgRunPolicyOverrides | null>();
	if (deploymentMode === "cloud") {
		const orgIds = [...new Set(enabledBrands.map((b) => b.organizationId))];
		const orgs = await db
			.select({ id: organization.id, metadata: organization.metadata })
			.from(organization)
			.where(inArray(organization.id, orgIds));
		for (const org of orgs) {
			orgOverridesMap.set(org.id, parseOrgRunPolicyOverrides(org.metadata));
		}
	}

	// Get last runs per prompt per (model, provider).
	const lastRunsQuery = await db
		.select({
			promptId: promptRuns.promptId,
			model: promptRuns.model,
			provider: promptRuns.provider,
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.groupBy(promptRuns.promptId, promptRuns.model, promptRuns.provider);

	const lastRunsMap = new Map<string, Map<string, Date>>();
	for (const run of lastRunsQuery) {
		let perPrompt = lastRunsMap.get(run.promptId);
		if (!perPrompt) {
			perPrompt = new Map();
			lastRunsMap.set(run.promptId, perPrompt);
		}
		perPrompt.set(lastRunKey(run.model, run.provider), new Date(run.lastRunAt));
	}

	// Get all pending jobs with their state info
	const pendingJobMap = await getPendingJobMap();

	const now = new Date();
	const promptsToSchedule: { promptId: string; cadenceHours: number }[] = [];
	const jobsToExpedite: string[] = []; // Job IDs to expedite (move start_after to now)

	for (const prompt of enabledPrompts) {
		const pendingJob = pendingJobMap.get(prompt.id);

		// Skip if there's an active or retry job (already being worked on)
		if (pendingJob && (pendingJob.state === "active" || pendingJob.state === "retry")) {
			continue;
		}

		const brand = brandMap.get(prompt.brandId);
		if (!brand) continue;

		const brandCadenceHours = brand.delayOverrideHours ?? defaultDelayHours;

		// Only the brand's selected targets count toward overdue — checking all
		// configured models would forever mark subset brands overdue and expedite
		// them every pass, bypassing cadence.
		let selectedConfigs: ReturnType<typeof selectTargetsForBrand>;
		try {
			selectedConfigs = selectTargetsForBrand(allTargets, brand.enabledModels);
		} catch (error) {
			console.warn(`[schedule-maintenance] Cannot resolve targets for prompt ${prompt.id}, skipping:`, error);
			continue;
		}

		const orgOverrides = deploymentMode === "cloud" ? (orgOverridesMap.get(brand.organizationId) ?? null) : null;
		const policies = selectedConfigs.map((config) =>
			resolveTargetRunPolicy(config, { deploymentMode, brandCadenceHours, orgOverrides }),
		);

		const lastRuns = lastRunsMap.get(prompt.id) ?? new Map<string, Date>();
		if (selectDueTargets(policies, lastRuns, now).length === 0) continue;

		const cadenceHours = minCadenceHours(policies, brandCadenceHours);
		if (pendingJob && pendingJob.state === "created") {
			// There's a future job scheduled - expedite it to run now
			jobsToExpedite.push(pendingJob.jobId);
		} else {
			// No pending job at all - create a new one
			promptsToSchedule.push({ promptId: prompt.id, cadenceHours });
		}
	}

	if (promptsToSchedule.length === 0 && jobsToExpedite.length === 0) {
		console.log("[schedule-maintenance] All prompts are on schedule or have pending jobs");
		return;
	}

	console.log(
		`[schedule-maintenance] Found ${promptsToSchedule.length} prompts needing new jobs, ${jobsToExpedite.length} jobs to expedite`,
	);

	// Expedite existing future jobs to run now by updating start_after
	if (jobsToExpedite.length > 0) {
		let expeditedCount = 0;
		for (const jobId of jobsToExpedite) {
			try {
				await db.execute(sql`
					UPDATE pgboss.job
					SET start_after = now()
					WHERE id = ${jobId}
					  AND state = 'created'
				`);
				expeditedCount++;
			} catch (error) {
				console.error(`[schedule-maintenance] Failed to expedite job ${jobId}:`, error);
			}
		}
		console.log(`[schedule-maintenance] Expedited ${expeditedCount} future jobs to run now`);
	}

	// Schedule new jobs for prompts with no pending job
	if (promptsToSchedule.length > 0) {
		const BATCH_SIZE = 50;
		let successCount = 0;
		let failCount = 0;

		for (let i = 0; i < promptsToSchedule.length; i += BATCH_SIZE) {
			const batch = promptsToSchedule.slice(i, i + BATCH_SIZE);
			const results = await Promise.allSettled(
				batch.map(({ promptId, cadenceHours }) =>
					boss.send(
						"process-prompt",
						{ promptId, cadenceHours },
						{
							singletonKey: `prompt-${promptId}`,
							singletonSeconds: 60 * 60, // 1 hour - prevent duplicates
							retryLimit: 3,
							retryDelay: 60,
							retryBackoff: true,
							expireInSeconds: 60 * 15,
						},
					),
				),
			);

			for (const result of results) {
				if (result.status === "fulfilled") {
					successCount++;
				} else {
					failCount++;
					console.error("[schedule-maintenance] Failed to schedule job:", result.reason);
				}
			}
		}

		console.log(
			`[schedule-maintenance] Scheduled ${successCount} new jobs${failCount > 0 ? ` (${failCount} failed)` : ""}`,
		);
	}
}

/**
 * Get pending jobs for each prompt, preferring the most active state.
 * Returns at most one job per prompt: active > retry > created.
 */
interface PendingJobInfo {
	jobId: string;
	state: "created" | "active" | "retry";
}

async function getPendingJobMap(): Promise<Map<string, PendingJobInfo>> {
	const result = await db.execute(sql`
		SELECT id, data->>'promptId' as prompt_id, state
		FROM pgboss.job
		WHERE name = 'process-prompt'
		  AND state IN ('created', 'active', 'retry')
		  AND data->>'promptId' IS NOT NULL
		ORDER BY
			CASE state
				WHEN 'active' THEN 1
				WHEN 'retry' THEN 2
				WHEN 'created' THEN 3
			END
	`);

	const map = new Map<string, PendingJobInfo>();
	for (const row of result.rows as { id: string; prompt_id: string; state: string }[]) {
		if (row.prompt_id && !map.has(row.prompt_id)) {
			map.set(row.prompt_id, {
				jobId: row.id,
				state: row.state as "created" | "active" | "retry",
			});
		}
	}

	return map;
}
