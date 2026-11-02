/**
 * What one firing of a prompt should do, decided before anything is spent.
 *
 * The worker used to choose between these seven outcomes inline, interleaved
 * with the database and provider calls that produced the evidence for them, so
 * the only way to ask "what happens to a prompt whose org has just been
 * cancelled?" was to run the whole job against a database. Worse, two of the
 * outcomes are indistinguishable from outside — a stopped chain and a parked one
 * both look like "no pending job" — and which one a prompt is in is exactly what
 * schedule-maintenance has to reconstruct.
 *
 * Naming them makes the difference writable down, and the choice testable on its
 * own. This is the same split `computeMaintenanceDecisions` already uses for the
 * self-healing pass: the worker gathers, this decides, the worker executes.
 */

import { failureBackoffHours } from "../run-backoff";
import { type PromptRunPlan, selectDueTargets, type TargetPlan } from "./policy";

export type PromptCycleAction =
	/**
	 * Queue nothing. The chain ends here and only schedule-maintenance can start
	 * it again — which, for `no-runnable-targets`, it will, within one pass of
	 * the plan producing targets (resubscribe, upgrade, new platform picks).
	 */
	| { kind: "stop"; reason: "prompt-gone" | "no-runnable-targets" }
	/** Spend nothing this cycle, but keep the chain alive. */
	| { kind: "reschedule"; delayHours: number; consecutiveFailures: number; reason: RescheduleReason }
	/** Run these targets, then reschedule according to how they went. */
	| { kind: "run"; targets: TargetPlan[]; rescheduleHours: number };

export type RescheduleReason =
	/** Disabled prompt or brand — it may be enabled again, so the chain stays alive. */
	| "disabled"
	/** Fired early (expedite, duplicate send) and everything is still fresh. */
	| "nothing-due"
	/** The org is past its runaway-protection ceiling for the day. */
	| "over-daily-ceiling"
	/** The cycle ran; the delay is a cadence or a failure backoff. See `afterPromptCycle`. */
	| "ran";

export interface PromptCycleState {
	/** Null when the prompt or its brand no longer exists. */
	prompt: { enabled: boolean } | null;
	brand: { enabled: boolean; delayOverrideHours: number | null } | null;
	defaultDelayHours: number;
	plan: PromptRunPlan;
	/** Last successful run per targetKey; failed runs write no row. */
	lastRunAtByKey: Map<string, Date>;
	/** Null when the org has no ceiling. */
	dailyRunCeiling: number | null;
}

/**
 * `isOverDailyCeiling` is a callback rather than a field because it costs a
 * query, and the decisions above it are the reason most firings never need one:
 * a disabled prompt or a prompt with nothing due must not pay for a scan of the
 * org's usage to find that out. It is the only impurity here, and it is the
 * caller's to supply, so tests pass a constant.
 */
export async function decidePromptCycle(
	state: PromptCycleState,
	now: Date,
	isOverDailyCeiling: (ceiling: number) => Promise<boolean>,
): Promise<PromptCycleAction> {
	const { prompt, brand, plan } = state;

	if (!prompt || !brand) return { kind: "stop", reason: "prompt-gone" };

	if (!prompt.enabled || !brand.enabled) {
		return {
			kind: "reschedule",
			delayHours: brand.delayOverrideHours ?? state.defaultDelayHours,
			consecutiveFailures: 0,
			reason: "disabled",
		};
	}

	// Unentitled org, no platform picks, or outside the plan's prompt pool.
	if (plan.targets.length === 0 || plan.rescheduleHours === null) {
		return { kind: "stop", reason: "no-runnable-targets" };
	}

	const targets = selectDueTargets(plan.targets, state.lastRunAtByKey, now);
	if (targets.length === 0) {
		return { kind: "reschedule", delayHours: plan.rescheduleHours, consecutiveFailures: 0, reason: "nothing-due" };
	}

	if (state.dailyRunCeiling !== null && (await isOverDailyCeiling(state.dailyRunCeiling))) {
		return {
			kind: "reschedule",
			delayHours: plan.rescheduleHours,
			consecutiveFailures: 0,
			reason: "over-daily-ceiling",
		};
	}

	return { kind: "run", targets, rescheduleHours: plan.rescheduleHours };
}

/**
 * What to do once a cycle's runs have settled.
 *
 * A cycle where nothing came back means the targets themselves are failing, so
 * the next attempt backs off rather than running on cadence; anything that
 * produced a run clears the streak. The streak rides on the job because a failed
 * run records nothing, so it is the only evidence that distinguishes a prompt
 * whose provider is down from one that has simply never run.
 */
export function afterPromptCycle(args: {
	attempted: number;
	succeeded: number;
	rescheduleHours: number;
	consecutiveFailures: number;
}): Extract<PromptCycleAction, { kind: "reschedule" }> {
	const failedCycle = args.attempted > 0 && args.succeeded === 0;
	const consecutiveFailures = failedCycle ? args.consecutiveFailures + 1 : 0;
	return {
		kind: "reschedule",
		// Capped at the cadence, so a prompt that stays broken costs what a healthy one costs.
		delayHours: failureBackoffHours(consecutiveFailures, args.rescheduleHours),
		consecutiveFailures,
		reason: "ran",
	};
}
