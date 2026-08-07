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
 * target at the brand cadence with RUNS_PER_PROMPT replication.
 */

import type { Entitlements } from "@workspace/config/entitlements";
import type { ModelConfig } from "@workspace/config/scrape-targets";
import type { DeploymentMode } from "@workspace/config/types";
import { RUNS_PER_PROMPT } from "../constants";
import { selectTargetsForBrand } from "../providers/runner";

export const CLAUDE_MODEL_NAME = "claude";

export interface TargetPlan {
	config: ModelConfig;
	intervalHours: number;
	replication: number;
}

export interface PromptRunPlan {
	targets: TargetPlan[];
	/**
	 * Hours until the chain's next firing (min target interval). Null = stop
	 * rescheduling — nothing to run (unentitled org, no platform picks, or the
	 * prompt is outside its pool). schedule-maintenance revives the chain
	 * within one tick of the plan producing targets again.
	 */
	rescheduleHours: number | null;
}

export interface ResolveRunPlanInput {
	mode: DeploymentMode;
	scrapeTargets: ModelConfig[];
	brand: { enabledModels: string[] | null; delayOverrideHours: number | null };
	prompt: { claudeMode: "base" | "web" | null };
	entitlements: Entitlements;
	defaultDelayHours: number;
	/**
	 * Whether this prompt is inside the org's tracked-prompt pool (oldest
	 * enabled prompts win after a downgrade). Non-cloud callers omit it.
	 */
	withinPromptPool?: boolean;
	/** Same, for the Claude pool. */
	withinClaudePool?: boolean;
}

export function resolvePromptRunPlan(input: ResolveRunPlanInput): PromptRunPlan {
	if (input.mode !== "cloud") {
		const interval = input.brand.delayOverrideHours ?? input.defaultDelayHours;
		const targets = selectTargetsForBrand(input.scrapeTargets, input.brand.enabledModels).map((config) => ({
			config,
			intervalHours: interval,
			replication: RUNS_PER_PROMPT,
		}));
		return { targets, rescheduleHours: targets.length > 0 ? interval : null };
	}

	const { entitlements } = input;
	if (entitlements.unlimited) {
		// Defensive: cloud mode always resolves limited entitlements.
		throw new Error("cloud run policy requires resolved (non-unlimited) entitlements");
	}
	if (!entitlements.trackingActive || input.withinPromptPool === false) {
		return { targets: [], rescheduleHours: null };
	}

	const targets: TargetPlan[] = [];

	// Standard platforms: the brand's picks, clamped to the plan menu, one
	// target per model (first SCRAPE_TARGETS match wins — the cloud operator
	// configures one implementation per menu model).
	const menuSet = new Set(entitlements.platformMenu ?? []);
	const picks =
		input.brand.enabledModels !== null
			? input.brand.enabledModels.filter((model) => menuSet.has(model))
			: // No explicit picks yet (e.g. brand created via the API before the
				// platform step): apply the defaults so a paying org is never
				// silently untracked.
				defaultPlatformPicks(entitlements, input.scrapeTargets);

	// A cadence override may only slow sampling below the plan rate. The write
	// path enforces the same floor, but a stored override can be faster than
	// the plan after a downgrade — clamp it here so it never speeds anything up.
	const overrideHours = input.brand.delayOverrideHours;
	const planStandardInterval = 24 / Math.max(1, entitlements.standardRunsPerDay ?? 1);
	const standardInterval = Math.max(overrideHours ?? planStandardInterval, planStandardInterval);
	const replication = entitlements.replication ?? 1;
	for (const model of picks.slice(0, entitlements.platformPicks ?? picks.length)) {
		const config = input.scrapeTargets.find((t) => t.model === model);
		if (!config) continue; // picked platform not configured on this instance
		targets.push({ config, intervalHours: standardInterval, replication });
	}

	// Claude: a per-prompt assignment against the org pool, never a platform
	// pick. Base vs web selects between the instance's claude targets.
	if (input.prompt.claudeMode && input.withinClaudePool !== false && entitlements.claudePool > 0) {
		const wantWebSearch = input.prompt.claudeMode === "web";
		const config = input.scrapeTargets.find((t) => t.model === CLAUDE_MODEL_NAME && t.webSearch === wantWebSearch);
		if (config) {
			const planClaudeInterval = 24 / Math.max(1, entitlements.claudeRunsPerDay);
			targets.push({
				config,
				intervalHours: Math.max(overrideHours ?? planClaudeInterval, planClaudeInterval),
				replication: 1,
			});
		}
	}

	if (targets.length === 0) return { targets, rescheduleHours: null };
	return { targets, rescheduleHours: Math.min(...targets.map((t) => t.intervalHours)) };
}

/**
 * Default platform picks for a cloud brand that hasn't chosen yet: the first
 * available menu platforms up to the plan's pick count. Written explicitly at
 * brand creation (and applied implicitly by the run policy when picks are
 * null) so a paying org is never silently untracked.
 */
export function defaultPlatformPicks(entitlements: Entitlements, scrapeTargets: ModelConfig[]): string[] {
	const available = new Set(scrapeTargets.filter((t) => t.model !== CLAUDE_MODEL_NAME).map((t) => t.model));
	return (entitlements.platformMenu ?? [])
		.filter((model) => available.has(model))
		.slice(0, entitlements.platformPicks ?? 0);
}

/**
 * Key for per-target run history. Claude base and web are the same model with
 * different web_search_enabled, so the flag is part of the identity.
 */
export function targetKey(config: Pick<ModelConfig, "model" | "webSearch">): string {
	return `${config.model}::${config.webSearch ? "web" : "base"}`;
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

export function selectDueTargets(targets: TargetPlan[], lastRunAtByKey: Map<string, Date>, now: Date): TargetPlan[] {
	return targets.filter((plan) => isTargetDue(plan, lastRunAtByKey.get(targetKey(plan.config)), now));
}

/**
 * Runaway-tenant ceiling: the theoretical daily maximum the plan
 * can produce, with headroom for pick changes and retries. Null = no ceiling.
 * Deliberately derived from plan limits (not current usage) so it's stable
 * and generous — it exists to stop pathology, not to shave legitimate runs.
 */
export function dailyRunCeiling(entitlements: Entitlements): number | null {
	if (entitlements.unlimited) return null;
	const standard =
		(entitlements.maxPrompts ?? 0) *
		(entitlements.platformPicks ?? 0) *
		(entitlements.standardRunsPerDay ?? 0) *
		(entitlements.replication ?? 1);
	const claude = entitlements.claudePool * entitlements.claudeRunsPerDay;
	return Math.ceil(1.5 * (standard + claude));
}
