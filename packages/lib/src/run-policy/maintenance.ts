/** Pure so the scheduler's self-healing is unit-testable; the worker gathers the state. */

import { shouldExpediteJob } from "../expedite";
import { dueToleranceMs, type PromptRunPlan, targetKey, targetOverdueStatus } from "./policy";

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
	pendingJob: {
		jobId: string;
		state: "created" | "active" | "retry";
		/** Failure streak it carries, so a deliberate backoff is distinguishable. */
		consecutiveFailures: number;
	} | null;
}

export interface MaintenanceDecisions {
	toSchedule: { promptId: string; cadenceHours: number }[];
	toExpedite: { promptId: string; jobId: string }[];
	/** Prompts overdue beyond the alert grace — the Sentry signal. */
	alertOverdueCount: number;
}

function isPromptOverdue(state: MaintenancePromptState, now: number, graceMs: number): boolean {
	return state.plan.targets.some(
		(target) =>
			targetOverdueStatus({
				intervalHours: target.intervalHours,
				lastRunAt: state.lastRunAtByKey.get(targetKey(target.config)),
				promptCreatedAt: state.promptCreatedAt,
				now,
				graceMs,
			}).isOverdue,
	);
}

type MaintenanceAction =
	| { kind: "none" }
	| { kind: "schedule"; cadenceHours: number }
	| { kind: "expedite"; jobId: string };

function actionForPrompt(state: MaintenancePromptState, nowMs: number): MaintenanceAction {
	// A job that is running or retrying is already being handled.
	if (state.pendingJob && state.pendingJob.state !== "created") return { kind: "none" };

	// No recorded runs counts as overdue, including history outside the query
	// window; isPromptOverdue alone would call a just-created prompt fresh.
	const hasAnyRun = state.lastRunAtByKey.size > 0;
	if (hasAnyRun && !isPromptOverdue(state, nowMs, 0)) return { kind: "none" };

	if (!state.pendingJob) {
		// rescheduleHours is non-null for every state that reaches here.
		return { kind: "schedule", cadenceHours: state.plan.rescheduleHours as number };
	}

	// Drag a future job forward only if the prompt has genuinely stalled.
	const runTimes = [...state.lastRunAtByKey.values()].map((d) => d.getTime());
	const expedite = shouldExpediteJob({
		jobConsecutiveFailures: state.pendingJob.consecutiveFailures,
		lastRunAt: runTimes.length > 0 ? new Date(Math.max(...runTimes)) : null,
		runFrequencyMs: (state.plan.rescheduleHours as number) * 3600 * 1000,
		now: nowMs,
		minIntervalMs: EXPEDITE_MIN_INTERVAL_MS,
	});
	return expedite ? { kind: "expedite", jobId: state.pendingJob.jobId } : { kind: "none" };
}

export function computeMaintenanceDecisions(promptStates: MaintenancePromptState[], now: Date): MaintenanceDecisions {
	const nowMs = now.getTime();
	const decisions: MaintenanceDecisions = { toSchedule: [], toExpedite: [], alertOverdueCount: 0 };

	for (const state of promptStates) {
		// No targets means the prompt is meant to be stopped, so it raises no alert.
		if (state.plan.targets.length === 0 || state.plan.rescheduleHours === null) continue;
		if (isPromptOverdue(state, nowMs, OVERDUE_ALERT_GRACE_MS)) decisions.alertOverdueCount++;

		const action = actionForPrompt(state, nowMs);
		if (action.kind === "schedule") {
			decisions.toSchedule.push({ promptId: state.promptId, cadenceHours: action.cadenceHours });
		} else if (action.kind === "expedite") {
			decisions.toExpedite.push({ promptId: state.promptId, jobId: action.jobId });
		}
	}

	return decisions;
}

/**
 * Oldest first, so a new prompt never displaces an old one after a downgrade. A
 * prompt asking for two premium models with one slot left keeps the first rather
 * than stranding a slot the org pays for.
 */
export function computePoolPositions(
	prompts: { id: string; createdAt: Date; premiumModels: string[] }[],
	limits: { maxPrompts: number | null; premiumPool: number },
): { withinPromptPool: Set<string>; premiumByPrompt: Map<string, string[]> } {
	const ordered = [...prompts].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
	);

	const withinPromptPool = new Set<string>();
	for (const prompt of limits.maxPrompts === null ? ordered : ordered.slice(0, limits.maxPrompts)) {
		withinPromptPool.add(prompt.id);
	}

	const premiumByPrompt = new Map<string, string[]>();
	let slotsUsed = 0;
	for (const prompt of ordered) {
		if (!withinPromptPool.has(prompt.id)) continue;
		const admitted: string[] = [];
		for (const model of prompt.premiumModels) {
			if (slotsUsed >= limits.premiumPool) break;
			admitted.push(model);
			slotsUsed++;
		}
		if (admitted.length > 0) premiumByPrompt.set(prompt.id, admitted);
	}

	return { withinPromptPool, premiumByPrompt };
}

/** Wide enough that the slowest cadence still sees its last run, bounded so it doesn't scan all of prompt_runs. */
export function lastRunQueryWindowMs(maxIntervalHours: number): number {
	const maxIntervalMs = maxIntervalHours * 3600 * 1000;
	return 2 * maxIntervalMs + OVERDUE_ALERT_GRACE_MS + dueToleranceMs(maxIntervalHours);
}
