import * as Sentry from "@sentry/node";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import {
	configRowsForBrand,
	type EffectiveTarget,
	fetchConfigRowsForBrands,
	getInstanceCatalog,
	resolveEffectiveTargets,
} from "@workspace/lib/config/resolve";
import { type Entitlements, getEntitlements } from "@workspace/lib/config/entitlements";
import { db } from "@workspace/lib/db/db";
import { brands, promptRuns, prompts } from "@workspace/lib/db/schema";
import { getProvider } from "@workspace/lib/providers";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import boss from "../boss";
import { fastestCadenceHours, isPromptOverdueByTargets, targetIdentityKey } from "./run-policy";

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

/** Live credential probe (reads the worker's refreshed overlay); fail-closed. */
function credentialsReady(providerId: string): boolean {
	try {
		return getProvider(providerId).isConfigured();
	} catch {
		return false;
	}
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
	// An empty catalog means nothing can run yet (first boot before import, or a
	// wiped catalog). Don't revive anything — boot already warned about it.
	const catalog = await getInstanceCatalog();
	if (catalog.length === 0) {
		console.log("[schedule-maintenance] No targets configured — nothing to schedule");
		return;
	}

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

	// Get all enabled prompts for enabled brands
	const enabledPrompts = await db.query.prompts.findMany({
		where: and(eq(prompts.enabled, true), inArray(prompts.brandId, brandIds)),
	});

	if (enabledPrompts.length === 0) {
		console.log("[schedule-maintenance] No enabled prompts found");
		return;
	}

	console.log(`[schedule-maintenance] Checking ${enabledPrompts.length} enabled prompts`);

	// Batch-resolve every brand's effective targets in one config round trip
	// (A8d): IN-list config rows + per-org entitlements + the cached catalog, fed
	// to the pure resolver per brand. Never a per-brand resolveBrandTargets loop.
	const orgIds = [...new Set(enabledBrands.map((b) => b.organizationId))];
	const [batch, entitlementsList] = await Promise.all([
		fetchConfigRowsForBrands(orgIds, brandIds),
		Promise.all(orgIds.map((orgId) => getEntitlements(orgId))),
	]);
	const entitlementsByOrg = new Map<string, Entitlements>(orgIds.map((orgId, i) => [orgId, entitlementsList[i]]));

	const brandTargets = new Map<string, EffectiveTarget[]>();
	let zeroTargetBrands = 0;
	for (const brand of enabledBrands) {
		const entitlements = entitlementsByOrg.get(brand.organizationId);
		if (!entitlements) continue;
		const { targets } = resolveEffectiveTargets({
			catalog,
			entitlements,
			rows: configRowsForBrand(batch, brand.organizationId, brand.id),
			level: "brand",
			credentialsReady,
		});
		brandTargets.set(brand.id, targets);
		if (targets.length === 0) zeroTargetBrands++;
	}
	if (zeroTargetBrands > 0) {
		console.log(`[schedule-maintenance] ${zeroTargetBrands} brand(s) resolved to zero targets — skipped this pass`);
	}

	// Last run per prompt per target identity (model, provider, webSearch).
	const lastRunsQuery = await db
		.select({
			promptId: promptRuns.promptId,
			model: promptRuns.model,
			provider: promptRuns.provider,
			webSearch: promptRuns.webSearchEnabled,
			lastRunAt: sql<string>`MAX(${promptRuns.createdAt})`,
		})
		.from(promptRuns)
		.groupBy(promptRuns.promptId, promptRuns.model, promptRuns.provider, promptRuns.webSearchEnabled);

	const lastRunsMap = new Map<string, Map<string, Date>>();
	for (const run of lastRunsQuery) {
		let perPrompt = lastRunsMap.get(run.promptId);
		if (!perPrompt) {
			perPrompt = new Map();
			lastRunsMap.set(run.promptId, perPrompt);
		}
		perPrompt.set(
			targetIdentityKey({ model: run.model, provider: run.provider, webSearch: run.webSearch }),
			new Date(run.lastRunAt),
		);
	}

	// Get all pending jobs with their state info
	const pendingJobMap = await getPendingJobMap();

	const now = Date.now();
	const promptsToSchedule: { promptId: string; cadenceHours: number }[] = [];
	const jobsToExpedite: string[] = []; // Job IDs to expedite (move start_after to now)

	reportOverduePrompts({ prompts: enabledPrompts, brandTargets, lastRunsMap, now });

	for (const prompt of enabledPrompts) {
		const pendingJob = pendingJobMap.get(prompt.id);

		// Skip if there's an active or retry job (already being worked on)
		if (pendingJob && (pendingJob.state === "active" || pendingJob.state === "retry")) {
			continue;
		}

		// Only the brand's resolved targets count toward overdue, each at its own
		// resolved cadence (the watchdog oversampling fix) — credentials-unready and
		// otherwise-excluded targets are already dropped by resolveEffectiveTargets.
		const targets = brandTargets.get(prompt.brandId) ?? [];
		if (targets.length === 0) continue;

		const lastRuns = lastRunsMap.get(prompt.id) ?? new Map<string, Date>();
		const overdue = isPromptOverdueByTargets({
			targets,
			lastRunAtByKey: lastRuns,
			promptCreatedAt: prompt.createdAt,
			now,
		});
		if (!overdue) continue;

		const cadenceHours = fastestCadenceHours(targets, defaultDelayHours);
		const runFrequencyMs = cadenceHours * 60 * 60 * 1000;

		if (pendingJob && pendingJob.state === "created") {
			// Throttle: if the prompt ran within the window it isn't really stalled,
			// so don't drag its next job forward again. A never-recording target
			// would otherwise keep it perpetually "overdue" and re-fire it every tick.
			const lastRunTimes = [...lastRuns.values()].map((d) => d.getTime());
			const mostRecentRunMs = lastRunTimes.length > 0 ? Math.max(...lastRunTimes) : null;
			if (mostRecentRunMs !== null && now - mostRecentRunMs < Math.min(runFrequencyMs, EXPEDITE_MIN_INTERVAL_MS)) {
				continue;
			}
			// There's a future job scheduled - expedite it to run now
			jobsToExpedite.push(pendingJob.jobId);
		} else {
			// No pending job at all - create a new one (this un-idles A8b prompts)
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
			const batchToSchedule = promptsToSchedule.slice(i, i + BATCH_SIZE);
			const results = await Promise.allSettled(
				batchToSchedule.map(({ promptId, cadenceHours }) =>
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
 * Report to Sentry (as an error, so it pages) when enabled prompts are overdue
 * on any of their resolved targets — each at its own resolved cadence — past a
 * grace window. Throttled in-process so a sustained outage doesn't emit a new
 * event on every maintenance tick.
 */
function reportOverduePrompts(input: {
	prompts: { id: string; brandId: string; createdAt: Date }[];
	brandTargets: Map<string, EffectiveTarget[]>;
	lastRunsMap: Map<string, Map<string, Date>>;
	now: number;
}): void {
	const { prompts: enabled, brandTargets, lastRunsMap, now } = input;

	let overduePrompts = 0;
	for (const prompt of enabled) {
		const targets = brandTargets.get(prompt.brandId) ?? [];
		if (targets.length === 0) continue;
		const overdue = isPromptOverdueByTargets({
			targets,
			lastRunAtByKey: lastRunsMap.get(prompt.id) ?? new Map<string, Date>(),
			promptCreatedAt: prompt.createdAt,
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
