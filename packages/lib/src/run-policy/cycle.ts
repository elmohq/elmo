import { failureBackoffHours } from "../run-backoff";
import { type PromptRunPlan, selectDueTargets, type TargetPlan } from "./policy";

export type PromptCycleAction =
	// Queues nothing; only schedule-maintenance can restart the chain, which it does
	// for `no-runnable-targets` once the plan produces targets again.
	| { kind: "stop"; reason: "prompt-gone" | "no-runnable-targets" }
	| { kind: "reschedule"; delayHours: number; consecutiveFailures: number; reason: RescheduleReason }
	| { kind: "run"; targets: TargetPlan[]; rescheduleHours: number };

export type RescheduleReason = "disabled" | "nothing-due" | "over-daily-ceiling" | "ran";

export interface PromptCycleState {
	prompt: { enabled: boolean } | null;
	brand: { enabled: boolean; delayOverrideHours: number | null } | null;
	defaultDelayHours: number;
	plan: PromptRunPlan;
	// Failed runs write no row, so this only reflects successful runs.
	lastRunAtByKey: Map<string, Date>;
	dailyRunCeiling: number | null;
}

// `isOverDailyCeiling` is a callback so firings decided earlier never pay for the usage query.
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

// The failure streak rides on the job because a failed run records nothing, so it is the
// only evidence separating a prompt whose provider is down from one that has never run.
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
