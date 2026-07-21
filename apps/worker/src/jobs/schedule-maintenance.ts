import * as Sentry from "@sentry/node";
import { db } from "@workspace/lib/db/db";
import { brands, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	getEffectiveEvaluationTargetsForPrompts,
	getEvaluationConfigurationVersion,
	isEffectiveEvaluationTargetOverdue,
	mapLastRunsToEffectiveTargets,
	minimumCadenceHours,
	selectDueEvaluationTargets,
	type EffectiveEvaluationTarget,
} from "@workspace/lib/evaluation-config";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import boss from "../boss";

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
 * Minimum time since a prompt's last run before maintenance will expedite its
 * next job again. Without it, a target that never records a run (e.g. a
 * consistently-failing provider) keeps every prompt perpetually "overdue", so
 * maintenance re-fires it every tick — turning one broken provider into a
 * fleet-wide run/cost storm. Mirrors the 1h throttle on the job-creation path.
 */
const EXPEDITE_MIN_INTERVAL_MS = 60 * 60 * 1000;

function getLastRunsForTargets(
	lastRuns: Record<string, Date>,
	targets: readonly EffectiveEvaluationTarget[],
): Map<string, Date> {
	return mapLastRunsToEffectiveTargets(
		targets,
		Object.entries(lastRuns).map(([key, lastRunAt]) => ({
			evaluationTargetId: key.startsWith("legacy:") ? null : key,
			model: key.startsWith("legacy:") ? key.slice("legacy:".length) : "",
			lastRunAt,
		})),
	);
}

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
	// Get all enabled prompts for enabled brands
	const enabledPrompts = await db.query.prompts.findMany({
		where: and(eq(prompts.enabled, true), inArray(prompts.brandId, brandIds)),
	});

	if (enabledPrompts.length === 0) {
		console.log("[schedule-maintenance] No enabled prompts found");
		return;
	}

	console.log(`[schedule-maintenance] Checking ${enabledPrompts.length} enabled prompts`);

	const effectiveTargetsByPrompt = await getEffectiveEvaluationTargetsForPrompts(
		enabledPrompts.map((prompt) => prompt.id),
	);
	const configurationVersion = await getEvaluationConfigurationVersion();
	const schedulablePrompts = enabledPrompts.filter(
		(prompt) => (effectiveTargetsByPrompt.get(prompt.id)?.length ?? 0) > 0,
	);
	if (schedulablePrompts.length === 0) {
		console.log("[schedule-maintenance] No enabled prompts have effective evaluation targets");
		return;
	}

	// New rows are identified by target ID. Historical rows have no target ID,
	// so retain a model-key fallback until their normal cadence replaces them.
	const lastRunsQuery = await db
		.select({
			promptId: promptRuns.promptId,
			model: promptRuns.model,
			evaluationTargetId: promptRuns.evaluationTargetId,
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.where(
			inArray(
				promptRuns.promptId,
				schedulablePrompts.map((prompt) => prompt.id),
			),
		)
		.groupBy(promptRuns.promptId, promptRuns.evaluationTargetId, promptRuns.model);

	const lastRunsMap: Record<string, Record<string, Date>> = {};
	for (const run of lastRunsQuery) {
		if (!lastRunsMap[run.promptId]) {
			lastRunsMap[run.promptId] = {};
		}
		const key = run.evaluationTargetId ?? `legacy:${run.model}`;
		const current = lastRunsMap[run.promptId][key];
		if (!current || run.lastRunAt > current) {
			lastRunsMap[run.promptId][key] = run.lastRunAt;
		}
	}

	// Get all pending jobs with their state info
	const pendingJobMap = await getPendingJobMap();

	const now = Date.now();
	const promptsToSchedule: { promptId: string; cadenceHours: number }[] = [];
	const jobsToExpedite: string[] = []; // Job IDs to expedite (move start_after to now)

	reportOverduePrompts({
		prompts: schedulablePrompts,
		effectiveTargetsByPrompt,
		lastRunsMap,
		now,
	});

	for (const prompt of schedulablePrompts) {
		const targets = effectiveTargetsByPrompt.get(prompt.id) ?? [];
		const pendingJob = pendingJobMap.get(prompt.id);

		// Skip if there's an active or retry job (already being worked on)
		if (pendingJob && (pendingJob.state === "active" || pendingJob.state === "retry")) {
			continue;
		}

		const cadenceHours = minimumCadenceHours(targets);
		if (cadenceHours === undefined) continue;
		const lastRuns = getLastRunsForTargets(lastRunsMap[prompt.id] || {}, targets);
		const dueTargets = selectDueEvaluationTargets(targets, lastRuns, new Date(now));

		if (dueTargets.length === 0) continue;

		if (pendingJob && pendingJob.state === "created") {
			// Throttle: if the prompt ran within the window it isn't really stalled,
			// so don't drag its next job forward again. A never-recording target
			// would otherwise keep it perpetually "overdue" and re-fire it every tick.
			const lastRunTimes = [...lastRuns.values()].map((d) => d.getTime());
			const mostRecentRunMs = lastRunTimes.length > 0 ? Math.max(...lastRunTimes) : null;
			if (
				mostRecentRunMs !== null &&
				now - mostRecentRunMs < Math.min(cadenceHours * 60 * 60 * 1000, EXPEDITE_MIN_INTERVAL_MS)
			) {
				continue;
			}
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
						{ promptId, cadenceHours, configurationVersion },
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
 * Report to Sentry (as an error, so it pages) when enabled prompts are overdue on
 * any of their models — the same per-model definition the dashboard uses — past a
 * grace window. Throttled in-process so a sustained outage doesn't emit a new event
 * on every maintenance tick.
 */
function reportOverduePrompts(input: {
	prompts: { id: string; brandId: string; createdAt: Date }[];
	effectiveTargetsByPrompt: Map<string, EffectiveEvaluationTarget[]>;
	lastRunsMap: Record<string, Record<string, Date>>;
	now: number;
}): void {
	const { prompts: enabled, effectiveTargetsByPrompt, lastRunsMap, now } = input;

	let overduePrompts = 0;
	for (const prompt of enabled) {
		const targets = effectiveTargetsByPrompt.get(prompt.id) ?? [];
		const lastRuns = getLastRunsForTargets(lastRunsMap[prompt.id] ?? {}, targets);
		const overdue = targets.some((target) =>
			isEffectiveEvaluationTargetOverdue({
				target,
				lastRunAt: lastRuns.get(target.targetId),
				promptCreatedAt: prompt.createdAt,
				now,
				graceMs: OVERDUE_ALERT_GRACE_MS,
			}),
		);
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
