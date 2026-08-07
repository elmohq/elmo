/**
 * Pure decision core for the worker's schedule-maintenance job. The worker
 * gathers state (prompts, resolved run plans, last runs, pending pg-boss
 * jobs); this decides which chains to revive, which future jobs to expedite,
 * and how many prompts are overdue enough to alert on. Keeping it pure makes
 * the self-healing behavior — historically the most incident-prone part of
 * the scheduler — exhaustively unit-testable.
 */

import { dueToleranceMs, type PromptRunPlan, targetKey } from "./policy";

/** Floor on how often maintenance may drag a prompt's next job forward. */
export const EXPEDITE_MIN_INTERVAL_MS = 60 * 60 * 1000;

/** Grace before an overdue prompt counts toward the Sentry alert. */
export const OVERDUE_ALERT_GRACE_MS = 30 * 60 * 1000;

export interface MaintenancePromptState {
	promptId: string;
	promptCreatedAt: Date;
	plan: PromptRunPlan;
	/** Last successful run per targetKey (failed runs write no row). */
	lastRunAtByKey: Map<string, Date>;
	pendingJob: { jobId: string; state: "created" | "active" | "retry" } | null;
}

export interface MaintenanceDecisions {
	toSchedule: { promptId: string; cadenceHours: number }[];
	toExpedite: { promptId: string; jobId: string }[];
	/** Prompts overdue beyond the alert grace — the Sentry signal. */
	alertOverdueCount: number;
}

function isPromptOverdue(state: MaintenancePromptState, now: number, graceMs: number): boolean {
	return state.plan.targets.some((target) => {
		const lastRunAt = state.lastRunAtByKey.get(targetKey(target.config));
		if (!lastRunAt) {
			return now - state.promptCreatedAt.getTime() > graceMs;
		}
		const intervalMs = target.intervalHours * 3600 * 1000;
		return now - lastRunAt.getTime() > intervalMs + graceMs;
	});
}

export function computeMaintenanceDecisions(promptStates: MaintenancePromptState[], now: Date): MaintenanceDecisions {
	const nowMs = now.getTime();
	const decisions: MaintenanceDecisions = { toSchedule: [], toExpedite: [], alertOverdueCount: 0 };

	for (const state of promptStates) {
		// No targets (unentitled org, no picks, outside the pool): the chain is
		// intentionally parked. Not overdue, nothing to revive, no alert noise.
		if (state.plan.targets.length === 0 || state.plan.rescheduleHours === null) continue;

		if (isPromptOverdue(state, nowMs, OVERDUE_ALERT_GRACE_MS)) {
			decisions.alertOverdueCount++;
		}

		// A job that is running or retrying is already being handled.
		if (state.pendingJob && state.pendingJob.state !== "created") continue;

		if (!isPromptOverdue(state, nowMs, 0)) continue;

		const minIntervalMs = Math.min(...state.plan.targets.map((t) => t.intervalHours)) * 3600 * 1000;

		if (state.pendingJob) {
			// A future job exists — drag it forward, but only if the prompt hasn't
			// run recently. A target that never records a run would otherwise keep
			// the prompt perpetually "overdue" and re-fire it every tick; dueness
			// metering in process-prompt bounds the damage, but the throttle keeps
			// the churn down too.
			const runTimes = [...state.lastRunAtByKey.values()].map((d) => d.getTime());
			const mostRecentRunMs = runTimes.length > 0 ? Math.max(...runTimes) : null;
			if (mostRecentRunMs !== null && nowMs - mostRecentRunMs < Math.min(minIntervalMs, EXPEDITE_MIN_INTERVAL_MS)) {
				continue;
			}
			decisions.toExpedite.push({ promptId: state.promptId, jobId: state.pendingJob.jobId });
		} else {
			decisions.toSchedule.push({
				promptId: state.promptId,
				cadenceHours: state.plan.rescheduleHours,
			});
		}
	}

	return decisions;
}

/**
 * Pool positions for downgrade handling: which enabled prompts are inside the
 * org's tracked-prompt pool and Claude pool. Oldest first (creation order, id
 * tiebreak) so a new prompt can never displace an old one's tracking.
 */
export function computePoolPositions(
	prompts: { id: string; createdAt: Date; claudeMode: "base" | "web" | null }[],
	limits: { maxPrompts: number | null; claudePool: number },
): { withinPromptPool: Set<string>; withinClaudePool: Set<string> } {
	const ordered = [...prompts].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
	);

	const withinPromptPool = new Set<string>();
	for (const prompt of limits.maxPrompts === null ? ordered : ordered.slice(0, limits.maxPrompts)) {
		withinPromptPool.add(prompt.id);
	}

	const withinClaudePool = new Set<string>();
	let claudeUsed = 0;
	for (const prompt of ordered) {
		if (prompt.claudeMode === null) continue;
		if (!withinPromptPool.has(prompt.id)) continue;
		if (claudeUsed >= limits.claudePool) break;
		withinClaudePool.add(prompt.id);
		claudeUsed++;
	}

	return { withinPromptPool, withinClaudePool };
}

/**
 * Window for the maintenance last-run query: wide enough that the slowest
 * cadence in play still sees its last run (otherwise a long-cadence brand
 * looks never-run and gets expedite-stormed), bounded so the aggregate stops
 * scanning all of prompt_runs on every tick.
 */
export function lastRunQueryWindowMs(maxIntervalHours: number): number {
	const maxIntervalMs = maxIntervalHours * 3600 * 1000;
	return 2 * maxIntervalMs + OVERDUE_ALERT_GRACE_MS + dueToleranceMs(maxIntervalHours);
}
