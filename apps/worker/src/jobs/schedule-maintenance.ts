import type { Job } from "pg-boss";
import { db } from "@workspace/lib/db/db";
import { brands, prompts, promptRuns } from "@workspace/lib/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { DEFAULT_DELAY_HOURS } from "@workspace/lib/constants";
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
	const brandDelayMap: Record<string, number> = {};
	for (const brand of enabledBrands) {
		brandDelayMap[brand.id] = brand.delayOverrideHours ?? DEFAULT_DELAY_HOURS;
	}

	// Get all enabled prompts for enabled brands
	const enabledPrompts = await db.query.prompts.findMany({
		where: and(eq(prompts.enabled, true), inArray(prompts.brandId, brandIds)),
	});

	if (enabledPrompts.length === 0) {
		console.log("[schedule-maintenance] No enabled prompts found");
		return;
	}

	console.log(`[schedule-maintenance] Checking ${enabledPrompts.length} enabled prompts`);

	// Get last runs for all prompts (most recent per prompt, any model group)
	const lastRunsQuery = await db
		.select({
			promptId: promptRuns.promptId,
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.groupBy(promptRuns.promptId);

	const lastRunsMap: Record<string, Date> = {};
	for (const run of lastRunsQuery) {
		lastRunsMap[run.promptId] = run.lastRunAt;
	}

	// Get all pending jobs (created, active, retry states)
	const pendingJobs = await getPendingJobPromptIds();

	const now = Date.now();
	const promptsToSchedule: { promptId: string; cadenceHours: number }[] = [];

	for (const prompt of enabledPrompts) {
		// Skip if there's already a pending job for this prompt
		if (pendingJobs.has(prompt.id)) {
			continue;
		}

		const cadenceHours = brandDelayMap[prompt.brandId] ?? DEFAULT_DELAY_HOURS;
		const runFrequencyMs = cadenceHours * 60 * 60 * 1000;
		const lastRunAt = lastRunsMap[prompt.id];

		// Check if overdue
		let isOverdue = false;
		if (!lastRunAt) {
			isOverdue = true; // Never run
		} else {
			const timeSinceRun = now - new Date(lastRunAt).getTime();
			if (timeSinceRun > runFrequencyMs) {
				isOverdue = true;
			}
		}

		if (isOverdue) {
			promptsToSchedule.push({ promptId: prompt.id, cadenceHours });
		}
	}

	if (promptsToSchedule.length === 0) {
		console.log("[schedule-maintenance] All prompts are on schedule or have pending jobs");
		return;
	}

	console.log(`[schedule-maintenance] Found ${promptsToSchedule.length} prompts needing jobs`);

	// Schedule jobs in batches
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
		`[schedule-maintenance] Scheduled ${successCount} jobs${failCount > 0 ? ` (${failCount} failed)` : ""}`,
	);
}

/**
 * Get the set of promptIds that have pending jobs (created, active, or retry state).
 */
async function getPendingJobPromptIds(): Promise<Set<string>> {
	// Query pgboss.job table directly for pending jobs
	const result = await db.execute(sql`
		SELECT DISTINCT data->>'promptId' as prompt_id
		FROM pgboss.job
		WHERE name = 'process-prompt'
		  AND state IN ('created', 'active', 'retry')
		  AND data->>'promptId' IS NOT NULL
	`);

	const promptIds = new Set<string>();
	for (const row of result.rows as { prompt_id: string }[]) {
		if (row.prompt_id) {
			promptIds.add(row.prompt_id);
		}
	}

	return promptIds;
}
