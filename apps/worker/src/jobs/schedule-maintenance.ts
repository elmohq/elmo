import * as Sentry from "@sentry/node";
import { getDeployment } from "@workspace/deployment";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, promptRuns, prompts } from "@workspace/lib/db/schema";
import { getOrgEntitlementsMap } from "@workspace/lib/entitlements";
import { parseScrapeTargets } from "@workspace/lib/providers";
import {
	computeMaintenanceDecisions,
	lastRunQueryWindowMs,
	type MaintenancePromptState,
	type PromptRunPlan,
	targetKey,
} from "@workspace/lib/run-policy";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import boss from "../boss";
import { resolveBrandPromptRunPlans } from "./run-plans";

export interface ScheduleMaintenanceData {
	source?: string; // For logging - "scheduled" or "manual"
}

// Don't re-emit the Sentry error more often than this while an outage persists.
const OVERDUE_ALERT_THROTTLE_MS = 30 * 60 * 1000;
let lastOverdueAlertMs = 0;

/**
 * Maintenance job that ensures all enabled prompts have scheduled jobs.
 * This is a self-healing mechanism that catches any prompts that fell through
 * the cracks (e.g., due to worker crashes, failed jobs, etc.) — and, since the
 * run policy landed, also the mechanism that revives chains parked while an
 * org was unentitled (canceled → resubscribed) or a brand had no platform
 * picks. The decision logic itself is pure (computeMaintenanceDecisions);
 * this job only gathers state and executes the decisions.
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
	const enabledBrands = await db.query.brands.findMany({
		where: eq(brands.enabled, true),
	});

	if (enabledBrands.length === 0) {
		console.log("[schedule-maintenance] No enabled brands found");
		return;
	}

	const brandById = new Map(enabledBrands.map((b) => [b.id, b]));
	const orgIds = [...new Set(enabledBrands.map((b) => b.organizationId))];
	const entitlementsByOrg = await getOrgEntitlementsMap(orgIds);

	const enabledPrompts = await db.query.prompts.findMany({
		where: and(
			eq(prompts.enabled, true),
			inArray(
				prompts.brandId,
				enabledBrands.map((b) => b.id),
			),
		),
	});

	if (enabledPrompts.length === 0) {
		console.log("[schedule-maintenance] No enabled prompts found");
		return;
	}

	console.log(`[schedule-maintenance] Checking ${enabledPrompts.length} enabled prompts`);

	// Pool positions are decided across the whole org, while run plans resolve
	// per brand — group the prompts both ways.
	const promptsByOrg = new Map<string, typeof enabledPrompts>();
	const promptsByBrand = new Map<string, typeof enabledPrompts>();
	for (const prompt of enabledPrompts) {
		const orgId = brandById.get(prompt.brandId)?.organizationId;
		if (!orgId) continue;
		const orgList = promptsByOrg.get(orgId) ?? [];
		orgList.push(prompt);
		promptsByOrg.set(orgId, orgList);
		const brandList = promptsByBrand.get(prompt.brandId) ?? [];
		brandList.push(prompt);
		promptsByBrand.set(prompt.brandId, brandList);
	}

	const mode = getDeployment().mode;
	const scrapeTargets = parseScrapeTargets(process.env.SCRAPE_TARGETS);
	const defaultDelayHours = getDefaultDelayHours();

	// Resolve every prompt's plan, brand by brand. A brand with a broken
	// configuration (e.g. enabledModels referencing a model no longer in
	// SCRAPE_TARGETS) must not take maintenance down for everyone — contain it
	// and move on.
	const planByPromptId = new Map<string, PromptRunPlan>();
	for (const [brandId, brandPrompts] of promptsByBrand) {
		const brand = brandById.get(brandId);
		if (!brand) continue;
		const entitlements = entitlementsByOrg.get(brand.organizationId);
		if (!entitlements) continue;
		try {
			const plans = resolveBrandPromptRunPlans({
				mode,
				scrapeTargets,
				defaultDelayHours,
				entitlements,
				orgPrompts: promptsByOrg.get(brand.organizationId) ?? [],
				brand: { enabledModels: brand.enabledModels, delayOverrideHours: brand.delayOverrideHours },
				prompts: brandPrompts,
			});
			for (const [promptId, plan] of plans) {
				planByPromptId.set(promptId, plan);
			}
		} catch (error) {
			console.error(`[schedule-maintenance] Skipping brand ${brand.id} (invalid target config):`, error);
		}
	}

	// Last runs per (prompt, target), bounded by the slowest cadence in play so
	// the aggregate stops scanning all of prompt_runs on every 5-minute tick.
	const maxIntervalHours = Math.max(
		1,
		...[...planByPromptId.values()].flatMap((plan) => plan.targets.map((t) => t.intervalHours)),
	);
	const windowStart = new Date(Date.now() - lastRunQueryWindowMs(maxIntervalHours));
	const lastRunsQuery = await db
		.select({
			promptId: promptRuns.promptId,
			model: promptRuns.model,
			webSearchEnabled: promptRuns.webSearchEnabled,
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.where(gt(promptRuns.createdAt, windowStart))
		.groupBy(promptRuns.promptId, promptRuns.model, promptRuns.webSearchEnabled);

	const lastRunsByPrompt = new Map<string, Map<string, Date>>();
	for (const run of lastRunsQuery) {
		let byKey = lastRunsByPrompt.get(run.promptId);
		if (!byKey) {
			byKey = new Map();
			lastRunsByPrompt.set(run.promptId, byKey);
		}
		byKey.set(targetKey({ model: run.model, webSearch: run.webSearchEnabled }), new Date(run.lastRunAt));
	}

	const pendingJobMap = await getPendingJobMap();

	const promptStates: MaintenancePromptState[] = [];
	for (const prompt of enabledPrompts) {
		const plan = planByPromptId.get(prompt.id);
		if (!plan) continue;
		promptStates.push({
			promptId: prompt.id,
			promptCreatedAt: prompt.createdAt,
			plan,
			lastRunAtByKey: lastRunsByPrompt.get(prompt.id) ?? new Map(),
			pendingJob: pendingJobMap.get(prompt.id) ?? null,
		});
	}

	const decisions = computeMaintenanceDecisions(promptStates, new Date());

	reportOverduePrompts(decisions.alertOverdueCount);

	if (decisions.toSchedule.length === 0 && decisions.toExpedite.length === 0) {
		console.log("[schedule-maintenance] All prompts are on schedule or have pending jobs");
		return;
	}

	console.log(
		`[schedule-maintenance] Found ${decisions.toSchedule.length} prompts needing new jobs, ${decisions.toExpedite.length} jobs to expedite`,
	);

	// Expedite existing future jobs to run now by updating start_after
	if (decisions.toExpedite.length > 0) {
		const jobIds = decisions.toExpedite.map((d) => d.jobId);
		try {
			// Bind each id as its own uuid param: drizzle flattens a JS array
			// into a single text param, which `ANY(...)` / `IN (...)` can't
			// compare against a uuid column.
			const inList = sql.join(
				jobIds.map((id) => sql`${id}::uuid`),
				sql`, `,
			);
			await db.execute(
				sql`UPDATE pgboss.job SET start_after = now() WHERE id IN (${inList}) AND state = 'created'`,
			);
			console.log(`[schedule-maintenance] Expedited ${jobIds.length} future jobs to run now`);
		} catch (error) {
			console.error(`[schedule-maintenance] Failed to expedite jobs:`, error);
		}
	}

	// Schedule new jobs for prompts with no pending job
	if (decisions.toSchedule.length > 0) {
		const BATCH_SIZE = 50;
		let successCount = 0;
		let failCount = 0;

		for (let i = 0; i < decisions.toSchedule.length; i += BATCH_SIZE) {
			const batch = decisions.toSchedule.slice(i, i + BATCH_SIZE);
			const results = await Promise.allSettled(
				batch.map(({ promptId }) =>
					boss.send(
						"process-prompt",
						{ promptId },
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
 * Report to Sentry (as an error, so it pages) when enabled, entitled prompts
 * are overdue on any of their targets past the grace window. Parked chains
 * (unentitled orgs, no picks) never count — a canceled customer is not an
 * outage. Throttled in-process so a sustained outage doesn't emit a new event
 * on every maintenance tick.
 */
function reportOverduePrompts(overduePrompts: number): void {
	if (overduePrompts === 0) return;
	const now = Date.now();
	if (now - lastOverdueAlertMs < OVERDUE_ALERT_THROTTLE_MS) return;
	lastOverdueAlertMs = now;

	console.warn(`[schedule-maintenance] ${overduePrompts} prompt(s) overdue by >30m — reporting to Sentry`);
	Sentry.withScope((scope) => {
		scope.setLevel("error");
		scope.setTag("scheduler", "overdue-prompts");
		scope.setFingerprint(["scheduler-overdue-prompts"]);
		Sentry.captureMessage(`Scheduler: ${overduePrompts} prompt(s) overdue by >30m`, "error");
	});
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
