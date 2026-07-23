/**
 * Pure schedule-time run-policy decisions for the worker (Round 4a, plan §7 +
 * amendments A5/A6/A8b). No DB, no provider probes — the job files fetch run
 * history and hand plain maps/counts here so every decision is unit-testable.
 *
 * Two guards, both enforced against ACTUAL run history (not config state), so
 * config churn (assign → run → unassign → reassign) can never multiply spend:
 *   - dueness: a target fires only once its resolved cadence has fully elapsed
 *     since its last run (completion-anchored, so a strict `>=` never
 *     over-delivers); an admin `force` bypasses this but never the budgets.
 *   - runnable budgets: a per-target trailing-24h cap (its own runs/day) and,
 *     for assignable-class models (Claude), an org-wide pool × runs/day cap.
 */
import { ASSIGNABLE_MODELS, UNLIMITED_COUNT } from "@workspace/config/plans";
import type { Entitlements } from "@workspace/lib/config/entitlements";
import { getModelOverdueStatus } from "@workspace/lib/overdue";

const HOUR_MS = 60 * 60 * 1000;
/** The runnable-budget accounting window (trailing 24h). */
export const RUN_WINDOW_HOURS = 24;
export const RUN_WINDOW_MS = RUN_WINDOW_HOURS * HOUR_MS;

/** The minimal target shape the pure decisions need; `EffectiveTarget` satisfies it. */
export interface RunPolicyTarget {
	model: string;
	provider: string;
	webSearch: boolean;
	runPolicy: { replication: number; cadenceHours: number };
}

/**
 * Identity a run is metered under. `version` is deliberately excluded: the
 * stored `prompt_runs.version` is the provider's *reported* model version, which
 * drifts from the catalog target's configured version — keying on it would let a
 * target's own history miss its budget and over-fire. `(model, provider,
 * webSearch)` are recorded verbatim from the target, so they always match, and
 * this still separates the base vs web-grounded variants of one model.
 */
export function targetIdentityKey(target: { model: string; provider: string | null; webSearch: boolean }): string {
	return `${target.model}\u0000${target.provider ?? ""}\u0000${target.webSearch ? "1" : "0"}`;
}

/** A number entitlement at/above the sentinel means "no cap" (custom plan / non-cloud). */
function isUnlimitedCount(n: number): boolean {
	return n >= UNLIMITED_COUNT;
}

/**
 * A target's own runs/day allowance from its (already ceiling-clamped) run
 * policy: `replication × 24 / cadenceHours`. Compared with `>=` against the
 * trailing-24h count, so a target that has already spent its day is skipped.
 */
export function allowedRunsPerDay(runPolicy: { replication: number; cadenceHours: number }): number {
	return (runPolicy.replication * RUN_WINDOW_HOURS) / runPolicy.cadenceHours;
}

/**
 * Completion-anchored dueness: never-run ⇒ due; otherwise due once at least
 * `cadenceHours` has elapsed. Strict `>=` can under-deliver by at most one
 * firing under mixed cadences but never over-delivers (never overspends).
 */
export function isDue(lastRunAtMs: number | undefined, cadenceHours: number, nowMs: number): boolean {
	if (lastRunAtMs === undefined) return true;
	return nowMs - lastRunAtMs >= cadenceHours * HOUR_MS;
}

/**
 * The org-wide runs/day budget for an assignable-class model: `claudePromptPool
 * × maxRunsPerDay[model]`. Returns `null` (no cap) when the plan is unlimited —
 * `maxRunsPerDay` absent (non-cloud), no ceiling for the model, or an unlimited
 * pool — short-circuiting before any multiply so the `Number.MAX_SAFE_INTEGER`
 * sentinel can't overflow.
 */
export function orgAssignableBudget(
	entitlements: Pick<Entitlements, "claudePromptPool" | "maxRunsPerDay">,
	model: string,
): number | null {
	const ceilings = entitlements.maxRunsPerDay;
	if (!ceilings) return null;
	const ceiling = ceilings[model] ?? ceilings["*"];
	if (ceiling === undefined) return null;
	const pool = entitlements.claudePromptPool;
	if (isUnlimitedCount(pool)) return null;
	return pool * ceiling;
}

export function isAssignableModel(model: string): boolean {
	return (ASSIGNABLE_MODELS as readonly string[]).includes(model);
}

/** Fastest (smallest) cadence among the targets; `fallback` when empty. */
export function fastestCadenceHours(targets: { runPolicy: { cadenceHours: number } }[], fallback: number): number {
	if (targets.length === 0) return fallback;
	return Math.min(...targets.map((t) => t.runPolicy.cadenceHours));
}

/**
 * The prompt job's reschedule decision (A8b): `null` when the prompt resolved to
 * zero effective targets — it must NOT self-reschedule (maintenance revives it
 * when config/catalog changes make a target eligible); otherwise the fastest
 * cadence among its targets, so mixed-cadence prompts fire often enough for
 * their tightest target.
 */
export function rescheduleCadenceHours(
	targets: { runPolicy: { cadenceHours: number } }[],
	fallback: number,
): number | null {
	if (targets.length === 0) return null;
	return fastestCadenceHours(targets, fallback);
}

/**
 * A target's run history under its identity key, folding in legacy null-provider
 * `prompt_runs` rows (written before the provider column existed): the later
 * lastRun of the two and the sum of the counts (disjoint row sets), so an
 * upgrade never treats old history as "never ran" and re-samples the fleet.
 */
export function targetRunHistory(
	target: { model: string; provider: string; webSearch: boolean },
	lastRunAtMsByKey: Map<string, number>,
	recentCountByKey: Map<string, number>,
): { lastRunAtMs: number | undefined; recentCount: number } {
	const exact = targetIdentityKey(target);
	const legacy = targetIdentityKey({ model: target.model, provider: null, webSearch: target.webSearch });
	const lastExact = lastRunAtMsByKey.get(exact);
	const lastLegacy = lastRunAtMsByKey.get(legacy);
	const lastRunAtMs =
		lastExact !== undefined && lastLegacy !== undefined ? Math.max(lastExact, lastLegacy) : (lastExact ?? lastLegacy);
	return { lastRunAtMs, recentCount: (recentCountByKey.get(exact) ?? 0) + (recentCountByKey.get(legacy) ?? 0) };
}

export type SkipReason = "not-due" | "target-budget-exhausted" | "org-budget-exhausted";

export interface RunnableDecisionInput<T extends RunPolicyTarget> {
	targets: T[];
	/** Admin run-now (or an all-uniform cadence) skips the due gate — never the budgets. */
	bypassDue: boolean;
	nowMs: number;
	/** identity key → last run epoch ms (from history). */
	lastRunAtMsByKey: Map<string, number>;
	/** identity key → count of runs in the trailing 24h window. */
	recentCountByKey: Map<string, number>;
	entitlements: Pick<Entitlements, "claudePromptPool" | "maxRunsPerDay">;
	/** assignable model → org-wide count of runs in the trailing 24h window. */
	orgAssignableUsedByModel: Map<string, number>;
}

export interface RunnableDecision<T extends RunPolicyTarget> {
	runnable: T[];
	skipped: Array<{ target: T; reason: SkipReason }>;
}

/**
 * Decide, per effective target, whether it runs this cycle. Order: dueness
 * (unless bypassed) → the target's own 24h budget → the org-wide assignable
 * budget. Org usage accrues locally as assignable targets are admitted, so two
 * assignable targets in one job can't both slip past a nearly-full pool.
 *
 * The org-wide budget is a SOFT cap across jobs: concurrent `process-prompt`
 * jobs for different prompts in the same org each read the same trailing-24h
 * snapshot (`orgAssignableUsedByModel`) before either records its runs, so under
 * concurrency the pool × runs/day ceiling can be modestly exceeded. This is
 * accepted by design — the overshoot is bounded by (concurrent same-org jobs ×
 * replication), the window is rolling, and completion-anchored dueness makes it
 * self-correct next cycle. It's a cost guard, not a hard invariant, so it isn't
 * worth an advisory lock or a dedicated budget-counter row across count+insert.
 */
export function selectRunnableTargets<T extends RunPolicyTarget>(input: RunnableDecisionInput<T>): RunnableDecision<T> {
	const orgUsed = new Map(input.orgAssignableUsedByModel);
	const runnable: T[] = [];
	const skipped: Array<{ target: T; reason: SkipReason }> = [];

	for (const target of input.targets) {
		const history = targetRunHistory(target, input.lastRunAtMsByKey, input.recentCountByKey);

		if (!input.bypassDue && !isDue(history.lastRunAtMs, target.runPolicy.cadenceHours, input.nowMs)) {
			skipped.push({ target, reason: "not-due" });
			continue;
		}

		if (history.recentCount >= allowedRunsPerDay(target.runPolicy)) {
			skipped.push({ target, reason: "target-budget-exhausted" });
			continue;
		}

		if (isAssignableModel(target.model)) {
			const budget = orgAssignableBudget(input.entitlements, target.model);
			const used = orgUsed.get(target.model) ?? 0;
			if (budget !== null && used >= budget) {
				skipped.push({ target, reason: "org-budget-exhausted" });
				continue;
			}
			orgUsed.set(target.model, used + target.runPolicy.replication);
		}

		runnable.push(target);
	}

	return { runnable, skipped };
}

/**
 * Whether a prompt is overdue on any of its resolved targets, each judged at its
 * own resolved cadence (the watchdog oversampling fix — only the brand's
 * selected targets, not every configured model at one cadence). `lastRunAtByKey`
 * is keyed by `targetIdentityKey` (legacy null-provider rows fall back like
 * `targetRunHistory`); `graceMs` widens the window for alerting.
 */
export function isPromptOverdueByTargets(input: {
	targets: RunPolicyTarget[];
	lastRunAtByKey: Map<string, Date>;
	promptCreatedAt: Date;
	now: number;
	graceMs?: number;
}): boolean {
	return input.targets.some((target) => {
		const exact = input.lastRunAtByKey.get(targetIdentityKey(target));
		const legacy = input.lastRunAtByKey.get(
			targetIdentityKey({ model: target.model, provider: null, webSearch: target.webSearch }),
		);
		const lastRunAt = exact && legacy ? (exact.getTime() >= legacy.getTime() ? exact : legacy) : (exact ?? legacy);
		return getModelOverdueStatus({
			lastRunAt,
			promptCreatedAt: input.promptCreatedAt,
			runFrequencyMs: target.runPolicy.cadenceHours * HOUR_MS,
			now: input.now,
			graceMs: input.graceMs,
		}).isOverdue;
	});
}
