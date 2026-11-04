/**
 * Schedule-time run policy: which targets a prompt should run, at what
 * per-target cadence, with what replication — resolved fresh on every firing
 * so subscription changes, plan changes, and platform-pick edits apply without
 * touching queued jobs.
 *
 * Two halves, both pure:
 *  - resolvePromptRunPlan: the prompt's target set + intervals.
 *  - selectDueTargets: which of those targets are actually due, metered
 *    against real prompt_runs history rather than the job cadence. That is
 *    what lets one job per prompt serve targets with different cadences, and
 *    why a duplicate firing (a maintenance expedite) re-runs only what is due.
 */

import type { Entitlements } from "@workspace/config/entitlements";
import type { ModelConfig } from "@workspace/config/scrape-targets";
import type { DeploymentMode } from "@workspace/config/types";
import { getRunsPerPrompt } from "../constants";
import { isGroundedApiTarget } from "../providers";
import { selectTargetsForBrand } from "../providers/runner";

export interface TargetPlan {
	config: ModelConfig;
	intervalHours: number;
	replication: number;
}

export function slowestIntervalHours(targets: readonly TargetPlan[]): number {
	return targets.length > 0 ? Math.max(...targets.map((target) => target.intervalHours)) : 0;
}

export interface PromptRunPlan {
	targets: TargetPlan[];
	/**
	 * Hours until the prompt next runs (min target interval). Null means queue
	 * nothing: there is nothing to run, because the org is unentitled, the brand
	 * picked no platforms, or the prompt is outside its plan's pool.
	 * schedule-maintenance starts the prompt again within one pass of the plan
	 * producing targets.
	 */
	rescheduleHours: number | null;
}

export interface ResolveRunPlanInput {
	scrapeTargets: ModelConfig[];
	brand: { enabledModels: string[] | null; delayOverrideHours: number | null };
	/**
	 * Premium models this prompt is tracked on, grounded — one pool slot each,
	 * already trimmed by the caller to what the org's pool covers.
	 */
	prompt: { premiumModels: string[] };
	entitlements: Entitlements;
	defaultDelayHours: number;
	/**
	 * Whether this prompt is inside the org's tracked-prompt pool (oldest
	 * enabled prompts win after a downgrade). Unmetered callers omit it.
	 */
	withinPromptPool?: boolean;
}

/** Hours between runs for a daily rate, guarding the zero a paused plan carries. */
function intervalForRate(runsPerDay: number): number {
	return 24 / Math.max(1, runsPerDay);
}

/** Unmetered deployments run every target the brand selects, at the brand cadence. */
function unlimitedRunPlan(input: ResolveRunPlanInput): PromptRunPlan {
	const interval = input.brand.delayOverrideHours ?? input.defaultDelayHours;
	const targets = selectTargetsForBrand(input.scrapeTargets, input.brand.enabledModels).map((config) => ({
		config,
		intervalHours: interval,
		replication: getRunsPerPrompt(),
	}));
	return { targets, rescheduleHours: targets.length > 0 ? interval : null };
}

/**
 * A pick always means the ungrounded target: the grounded one is sold from the
 * premium pool, so picking a premium model must not quietly buy the expensive
 * call. A picked platform that isn't configured on this instance drops out.
 */
function standardTargets(input: ResolveRunPlanInput, intervalHours: number, replication: number): TargetPlan[] {
	return resolveBrandPicks(input.entitlements, input.brand, input.scrapeTargets)
		.map((model) => input.scrapeTargets.find((t) => t.model === model && !isGroundedApiTarget(t)))
		.filter((config) => config !== undefined)
		.map((config) => ({ config, intervalHours, replication }));
}

/**
 * Each prompt/model pair the org has spent a pool slot on runs the model's
 * grounded target, which costs an order of magnitude more than the same model
 * ungrounded and so is never a platform pick.
 */
function premiumTargets(input: ResolveRunPlanInput, intervalHours: number): TargetPlan[] {
	if (input.entitlements.premiumPool <= 0) return [];
	return input.prompt.premiumModels
		.map((model) => input.scrapeTargets.find((t) => t.model === model && isGroundedApiTarget(t)))
		.filter((config) => config !== undefined)
		.map((config) => ({ config, intervalHours, replication: 1 }));
}

export function resolvePromptRunPlan(input: ResolveRunPlanInput): PromptRunPlan {
	const { entitlements } = input;

	// Metering follows the entitlements, never a separately-passed deployment
	// mode: if the two disagreed, a paying org would run on every configured
	// platform instead of the ones it bought.
	if (entitlements.unlimited) return unlimitedRunPlan(input);

	if (!entitlements.trackingActive || input.withinPromptPool === false) {
		return { targets: [], rescheduleHours: null };
	}

	// A cadence override may only slow sampling below the plan rate. The write
	// path enforces the same floor, but a stored override can be faster than
	// the plan after a downgrade — clamp it here so it never speeds anything up.
	// The brand's one override governs both rates: it is the customer saying
	// "sample me less often", which is not a statement about a particular tier.
	const overrideHours = input.brand.delayOverrideHours;
	const slowerOf = (planInterval: number) => Math.max(overrideHours ?? planInterval, planInterval);

	const targets = [
		...standardTargets(
			input,
			slowerOf(intervalForRate(entitlements.standardRunsPerDay ?? 1)),
			entitlements.replication ?? 1,
		),
		...premiumTargets(input, slowerOf(intervalForRate(entitlements.premiumRunsPerDay))),
	];

	if (targets.length === 0) return { targets, rescheduleHours: null };
	return { targets, rescheduleHours: Math.min(...targets.map((t) => t.intervalHours)) };
}

/**
 * Which standard platforms a metered brand is tracked on: its own picks,
 * clamped to what the plan sells and to how many it may run at once — or the
 * plan's defaults when it has never chosen.
 *
 * The run policy, the LLM settings page and the prompts view all ask this; any
 * of them answering on its own would read a brand with no stored picks as
 * tracking every configured target instead of its plan defaults.
 */
export function resolveBrandPicks(
	entitlements: Entitlements,
	brand: { enabledModels: string[] | null },
	scrapeTargets: ModelConfig[],
): string[] {
	const menu = new Set(entitlements.platformMenu ?? []);
	const picks =
		brand.enabledModels !== null
			? brand.enabledModels.filter((model) => menu.has(model))
			: defaultPlatformPicks(entitlements, scrapeTargets);
	return picks.slice(0, entitlements.platformPicks ?? picks.length);
}

/**
 * Default platform picks for a cloud brand that hasn't chosen yet: the first
 * available menu platforms up to the plan's pick count. Written explicitly at
 * brand creation (and applied implicitly by the run policy when picks are
 * null) so a paying org is never silently untracked.
 */
export function defaultPlatformPicks(entitlements: Entitlements, scrapeTargets: ModelConfig[]): string[] {
	// A grounded target belongs to the premium pool and must never be picked as a
	// platform, so a model only counts as available if it has an ungrounded target.
	const available = new Set(scrapeTargets.filter((t) => !isGroundedApiTarget(t)).map((t) => t.model));
	return (entitlements.platformMenu ?? [])
		.filter((model) => available.has(model))
		.slice(0, entitlements.platformPicks ?? 0);
}

/**
 * Key for per-target run history.
 *
 * The provider is part of the identity, not just the model and its web-search
 * flag: a brand can track ChatGPT scraped off the consumer product *and*
 * grounded through an API, and both are `chatgpt` with web search on. Sharing
 * a cadence slot, the scraped target's frequent runs would keep the premium one
 * looking fresh so it never came due.
 *
 * Keys are never stored — both sides compute them from prompt_runs columns —
 * so changing this shape needs no reprocessing. Pointing a model at a
 * different provider restarts its cadence, which is right for a new source.
 */
export function targetKey(config: Pick<ModelConfig, "model" | "provider" | "webSearch">): string {
	return `${config.model}::${config.provider}::${config.webSearch ? "web" : "base"}`;
}

export interface LastRunRow {
	model: string;
	/** Nullable on the column: a row without one predates target keying. */
	provider: string | null;
	webSearchEnabled: boolean;
	lastRunAt: Date | string;
}

export function lastRunsByTargetKey(rows: readonly LastRunRow[]): Map<string, Date> {
	const byKey = new Map<string, Date>();
	for (const row of rows) {
		if (!row.provider) continue;
		byKey.set(
			targetKey({ model: row.model, provider: row.provider, webSearch: row.webSearchEnabled }),
			new Date(row.lastRunAt),
		);
	}
	return byKey;
}

/**
 * Tolerance for cadence jitter: a job that fires slightly early still runs
 * its targets instead of skipping a whole cycle. Capped so long cadences
 * don't open a wide double-run window.
 */
export function dueToleranceMs(intervalHours: number): number {
	return Math.min(30 * 60 * 1000, intervalHours * 3600 * 1000 * 0.25);
}

export function isTargetDue(plan: TargetPlan, lastRunAt: Date | undefined, now: Date): boolean {
	if (!lastRunAt) return true;
	const intervalMs = plan.intervalHours * 3600 * 1000;
	return now.getTime() - lastRunAt.getTime() >= intervalMs - dueToleranceMs(plan.intervalHours);
}

export interface TargetOverdueStatus {
	isOverdue: boolean;
	/** How far past cadence the last run is, in ms; null when never run or on schedule. */
	overdueByMs: number | null;
}

/**
 * Whether a target has missed its cadence — the single definition of "overdue",
 * shared by the maintenance sweep, the Sentry alert, and the admin dashboard.
 *
 * Distinct from `isTargetDue`, which asks whether to run now (and so leans
 * early, with jitter tolerance). This asks whether something is wrong, and so
 * leans late: a target is overdue only once it is a whole interval past its last
 * run, plus whatever grace the caller wants. A target that has never run is
 * overdue once the prompt itself is past the grace window — failed runs record
 * no row, so a target broken on one provider shows up even while its siblings
 * stay fresh.
 */
export function targetOverdueStatus(input: {
	intervalHours: number;
	lastRunAt: Date | null | undefined;
	promptCreatedAt: Date;
	now: number;
	graceMs?: number;
}): TargetOverdueStatus {
	const graceMs = input.graceMs ?? 0;
	if (!input.lastRunAt) {
		return { isOverdue: input.now - input.promptCreatedAt.getTime() > graceMs, overdueByMs: null };
	}
	const intervalMs = input.intervalHours * 3600 * 1000;
	const sinceRun = input.now - input.lastRunAt.getTime();
	if (sinceRun > intervalMs + graceMs) return { isOverdue: true, overdueByMs: sinceRun - intervalMs };
	return { isOverdue: false, overdueByMs: null };
}

export function selectDueTargets(targets: TargetPlan[], lastRunAtByKey: Map<string, Date>, now: Date): TargetPlan[] {
	return targets.filter((plan) => isTargetDue(plan, lastRunAtByKey.get(targetKey(plan.config)), now));
}

/**
 * Runaway-tenant ceiling: the theoretical daily maximum the plan
 * can produce, with headroom for pick changes and retries. Null = no ceiling.
 * Deliberately derived from plan limits (not current usage) so it's stable
 * and generous: it stops runaway scheduling without limiting legitimate runs.
 */
export function dailyRunCeiling(entitlements: Entitlements): number | null {
	if (entitlements.unlimited) return null;
	const standard =
		(entitlements.maxPrompts ?? 0) *
		(entitlements.platformPicks ?? 0) *
		(entitlements.standardRunsPerDay ?? 0) *
		(entitlements.replication ?? 1);
	const premium = entitlements.premiumPool * entitlements.premiumRunsPerDay;
	return Math.ceil(1.5 * (standard + premium));
}
