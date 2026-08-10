import * as Sentry from "@sentry/node";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, promptRuns, prompts } from "@workspace/lib/db/schema";
import { isPromptOverdue } from "@workspace/lib/overdue";
import { parseScrapeTargets } from "@workspace/lib/providers";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import boss from "../boss";
import { PROMPT_JOB_OPTIONS } from "./process-prompt";

export interface ScheduleMaintenanceData {
	source?: string; // For logging - "scheduled" or "manual"
}

// A prompt counts as overdue for alerting only once it's more than this far past
// its cadence (or, if it has never run, this long after being created) — a grace
// window so normal jitter and freshly-created prompts don't trip it.
const OVERDUE_ALERT_GRACE_MS = 30 * 60 * 1000;
// Don't re-emit the Sentry error more often than this while an outage persists.
const OVERDUE_ALERT_THROTTLE_MS = 30 * 60 * 1000;
let lastOverdueAlertMs = 0;

/**
 * Minimum time since a prompt was last attempted before maintenance will queue
 * it again, on either path.
 *
 * Measured against the last attempt rather than the last recorded run, because
 * a failed run records nothing: a prompt whose provider is down looks like it
 * has never run no matter how many times it has been tried, which is exactly
 * when re-firing it every tick turns one broken provider into a fleet-wide run
 * and cost storm.
 *
 * The singleton key on the send below does bound the create path on its own —
 * one job per prompt per fixed hourly slot — but only that path, and only for
 * as long as the previous job is still in pg-boss's table rather than its
 * archive. Something this expensive to get wrong shouldn't rest on the shape of
 * a queue's uniqueness index, and the expedite path has no equivalent at all.
 */
const ATTEMPT_MIN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Maintenance job that ensures all enabled prompts have scheduled jobs.
 * This is a self-healing mechanism that catches any prompts that fell through
 * the cracks (e.g., due to worker crashes, failed jobs, etc.).
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
	const brandDelayMap: Record<string, number> = {};
	for (const brand of enabledBrands) {
		brandDelayMap[brand.id] = brand.delayOverrideHours ?? defaultDelayHours;
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

	const allModels = parseScrapeTargets(process.env.SCRAPE_TARGETS);
	const modelNames = allModels.map((cfg) => cfg.model);

	// Get last runs per prompt per model (matches dashboard overdue logic)
	const lastRunsQuery = await db
		.select({
			promptId: promptRuns.promptId,
			model: promptRuns.model,
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.groupBy(promptRuns.promptId, promptRuns.model);

	const lastRunsMap: Record<string, Record<string, Date>> = {};
	for (const run of lastRunsQuery) {
		if (!lastRunsMap[run.promptId]) {
			lastRunsMap[run.promptId] = {};
		}
		lastRunsMap[run.promptId][run.model] = run.lastRunAt;
	}

	// Get all pending jobs with their state info
	const pendingJobMap = await getPendingJobMap();
	const lastAttemptMap = await getLastAttemptMap();

	const now = Date.now();
	const promptsToSchedule: { promptId: string; cadenceHours: number }[] = [];
	const jobsToExpedite: string[] = []; // Job IDs to expedite (move start_after to now)

	reportOverduePrompts({
		prompts: enabledPrompts,
		brandDelayHours: brandDelayMap,
		defaultDelayHours,
		lastRunsMap,
		modelNames,
		now,
	});

	for (const prompt of enabledPrompts) {
		const pendingJob = pendingJobMap.get(prompt.id);

		// Skip if there's an active or retry job (already being worked on)
		if (pendingJob && (pendingJob.state === "active" || pendingJob.state === "retry")) {
			continue;
		}

		const cadenceHours = brandDelayMap[prompt.brandId] ?? defaultDelayHours;
		const runFrequencyMs = cadenceHours * 60 * 60 * 1000;
		const lastRuns = lastRunsMap[prompt.id] || {};

		const isOverdue = isPromptOverdue({
			models: modelNames,
			lastRunByModel: lastRuns,
			promptCreatedAt: prompt.createdAt,
			runFrequencyMs,
			now,
		});

		if (!isOverdue) continue;

		// Throttle both paths: a prompt tried within the window isn't stalled,
		// whether or not that attempt managed to record anything. The queue is
		// the source of truth for "tried" and recorded runs for "worked" — keep
		// both, since pg-boss eventually drops old jobs.
		const lastRunTimes = Object.values(lastRuns).map((d) => new Date(d).getTime());
		const lastActivityMs = Math.max(lastAttemptMap.get(prompt.id) ?? Number.NEGATIVE_INFINITY, ...lastRunTimes);
		if (Number.isFinite(lastActivityMs) && now - lastActivityMs < Math.min(runFrequencyMs, ATTEMPT_MIN_INTERVAL_MS)) {
			continue;
		}

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
		let throttledCount = 0;
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
							...PROMPT_JOB_OPTIONS,
						},
					),
				),
			);

			for (const result of results) {
				if (result.status === "rejected") {
					failCount++;
					console.error("[schedule-maintenance] Failed to schedule job:", result.reason);
				} else if (result.value === null) {
					// pg-boss resolves to null when the singleton key suppresses the
					// send. Counting that as scheduled reports work that never
					// happened, which is misleading in exactly the situation this
					// log gets read in.
					throttledCount++;
				} else {
					successCount++;
				}
			}
		}

		const notes = [
			throttledCount > 0 ? `${throttledCount} already queued` : null,
			failCount > 0 ? `${failCount} failed` : null,
		].filter(Boolean);
		console.log(
			`[schedule-maintenance] Scheduled ${successCount} new jobs${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`,
		);
	}
}

/**
 * Report to Sentry (as an error, so it pages) when enabled prompts are overdue on
 * any of their models — the same per-model definition the dashboard uses — past a
 * grace window. Throttled in-process so a sustained outage doesn't emit a new event
 * on every maintenance tick.
 */
function reportOverduePrompts(input: {
	prompts: { id: string; brandId: string; createdAt: Date }[];
	brandDelayHours: Record<string, number>;
	defaultDelayHours: number;
	lastRunsMap: Record<string, Record<string, Date>>;
	modelNames: string[];
	now: number;
}): void {
	const { prompts: enabled, brandDelayHours, defaultDelayHours, lastRunsMap, modelNames, now } = input;

	let overduePrompts = 0;
	for (const prompt of enabled) {
		const runFrequencyMs = (brandDelayHours[prompt.brandId] ?? defaultDelayHours) * 60 * 60 * 1000;
		const overdue = isPromptOverdue({
			models: modelNames,
			lastRunByModel: lastRunsMap[prompt.id] ?? {},
			promptCreatedAt: prompt.createdAt,
			runFrequencyMs,
			now,
			graceMs: OVERDUE_ALERT_GRACE_MS,
		});
		if (overdue) overduePrompts++;
	}

	if (overduePrompts === 0) return;
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

/**
 * When each prompt was last queued or run, in epoch ms, from the job table.
 *
 * Runs are only recorded when they succeed, so this is the only record that a
 * prompt whose provider is failing was tried at all — see
 * ATTEMPT_MIN_INTERVAL_MS. Jobs in any state count, including one created but
 * not yet due, so a prompt already waiting on its next cycle isn't queued twice.
 * Archived jobs are gone from this table, which is why the caller still falls
 * back to recorded runs.
 *
 * Only the throttle window is read: an older attempt can't block anything, and
 * leaving it out keeps this off the full job history every five minutes.
 */
async function getLastAttemptMap(): Promise<Map<string, number>> {
	const windowSeconds = ATTEMPT_MIN_INTERVAL_MS / 1000;
	const result = await db.execute(sql`
		SELECT data->>'promptId' AS prompt_id,
		       MAX(COALESCE(completed_on, started_on, created_on)) AS last_attempt
		FROM pgboss.job
		WHERE name = 'process-prompt'
		  AND data->>'promptId' IS NOT NULL
		  AND COALESCE(completed_on, started_on, created_on) > now() - make_interval(secs => ${windowSeconds})
		GROUP BY 1
	`);

	const map = new Map<string, number>();
	for (const row of result.rows as { prompt_id: string; last_attempt: string | Date | null }[]) {
		if (!row.prompt_id || !row.last_attempt) continue;
		const at = new Date(row.last_attempt).getTime();
		if (Number.isFinite(at)) map.set(row.prompt_id, at);
	}

	return map;
}
