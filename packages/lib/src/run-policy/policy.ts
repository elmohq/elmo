/**
 * Schedule-time run policy: which targets a prompt should run, at what
 * per-target cadence, with what replication — resolved fresh on every firing
 * so subscription changes, plan changes, and platform-pick edits apply without
 * touching queued jobs.
 *
 * Two halves, both pure:
 *  - resolvePromptRunPlan: the prompt's target set + intervals.
 *  - selectDueTargets: which of those targets are actually due, metered
 *    against real prompt_runs history. Metering against history (rather than
 *    trusting the job cadence) is what makes per-target cadence work with the
 *    existing one-job-per-prompt scheduler, keeps in-flight jobs from before
 *    an upgrade valid, and structurally prevents duplicate-fire oversampling
 *    (a maintenance expedite re-runs only what is due).
 *
 * Non-cloud modes resolve exactly today's behavior: every brand-selected
 * target at the brand cadence, replicated RUNS_PER_PROMPT times.
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

export function resolvePromptRunPlan(input: ResolveRunPlanInput): PromptRunPlan {
	const { entitlements } = input;

	// Unmetered deployments run every target the brand selects, at the brand
	// cadence. Read off the entitlements rather than a separately-passed
	// deployment mode: the two came from different places (one from
	// @workspace/deployment, one from the environment the entitlement query
	// read), and a worker whose mode said "not cloud" while the org's
	// entitlements said otherwise would quietly run a paying customer on every
	// configured platform instead of the four they bought.
	if (entitlements.unlimited) {
		const interval = input.brand.delayOverrideHours ?? input.defaultDelayHours;
		const targets = selectTargetsForBrand(input.scrapeTargets, input.brand.enabledModels).map((config) => ({
			config,
			intervalHours: interval,
			replication: getRunsPerPrompt(),
		}));
		return { targets, rescheduleHours: targets.length > 0 ? interval : null };
	}

	if (!entitlements.trackingActive || input.withinPromptPool === false) {
		return { targets: [], rescheduleHours: null };
	}

	const targets: TargetPlan[] = [];

	const picks = resolveBrandPicks(entitlements, input.brand, input.scrapeTargets);

	// A cadence override may only slow sampling below the plan rate. The write
	// path enforces the same floor, but a stored override can be faster than
	// the plan after a downgrade — clamp it here so it never speeds anything up.
	// The brand's one override governs both rates: it is the customer saying
	// "sample me less often", which is not a statement about a particular tier.
	const overrideHours = input.brand.delayOverrideHours;
	const slowerOf = (planInterval: number) => Math.max(overrideHours ?? planInterval, planInterval);
	const standardInterval = slowerOf(intervalForRate(entitlements.standardRunsPerDay ?? 1));
	const premiumInterval = slowerOf(intervalForRate(entitlements.premiumRunsPerDay));
	const replication = entitlements.replication ?? 1;
	for (const model of picks) {
		// A pick always means the ungrounded target: the grounded one is sold from
		// the premium pool below, so picking a premium model must not quietly buy
		// the expensive call.
		const config = input.scrapeTargets.find((t) => t.model === model && !isGroundedApiTarget(t));
		if (!config) continue; // picked platform not configured on this instance
		targets.push({ config, intervalHours: standardInterval, replication });
	}

	// The premium tier: each prompt/model pair the org has spent a slot on runs
	// the model's grounded target, which costs an order of magnitude more than
	// the same model ungrounded and so is never a platform pick.
	if (entitlements.premiumPool > 0) {
		for (const model of input.prompt.premiumModels) {
			const config = input.scrapeTargets.find((t) => t.model === model && isGroundedApiTarget(t));
			if (config) targets.push({ config, intervalHours: premiumInterval, replication: 1 });
		}
	}

	if (targets.length === 0) return { targets, rescheduleHours: null };
	return { targets, rescheduleHours: Math.min(...targets.map((t) => t.intervalHours)) };
}

/**
 * Which standard platforms a metered brand is tracked on: its own picks,
 * clamped to what the plan sells and to how many it may run at once — or the
 * plan's defaults when it has never chosen.
 *
 * The single answer to "what is this brand tracked on", because three surfaces
 * asked it independently and a brand with no stored picks got a different
 * answer from each: the run policy applied the plan defaults while the LLM
 * settings page and the prompts view both read null as "every configured
 * target", showing ten platforms to a brand running four.
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
 * grounded through an API, and both are `chatgpt` with web search on. Keyed on
 * model alone the two shared a cadence slot, so the scraped target's four runs
 * a day kept the premium one looking fresh and it never came due.
 *
 * Changing this shape costs no reprocessing, because keys are never stored:
 * both sides compute one from (model, provider, web_search_enabled), and
 * prompt_runs has recorded all three since the run was written. A deploy
 * therefore matches existing history rather than treating every target as
 * never-run. The one case that does re-fire once is an operator pointing a
 * model at a different provider — which is a different data source, so
 * restarting its cadence is the right answer.
 */
export function targetKey(config: Pick<ModelConfig, "model" | "provider" | "webSearch">): string {
	return `${config.model}::${config.provider}::${config.webSearch ? "web" : "base"}`;
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
