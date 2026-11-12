/**
 * Resolved fresh on every firing, so plan and pick changes apply without touching
 * queued jobs. Due targets are metered against prompt_runs history rather than the
 * job cadence, so one job serves targets with different cadences and a duplicate
 * firing re-runs only what is due.
 */

import type { Entitlements } from "@workspace/config/entitlements";
import { KNOWN_MODELS } from "@workspace/config/models";
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
	/** Null queues nothing; schedule-maintenance restarts the prompt once the plan produces targets. */
	rescheduleHours: number | null;
}

export interface ResolveRunPlanInput {
	scrapeTargets: ModelConfig[];
	brand: { enabledModels: string[] | null; delayOverrideHours: number | null };
	/** Already trimmed by the caller to what the org's pool covers. */
	prompt: { premiumModels: string[] };
	entitlements: Entitlements;
	defaultDelayHours: number;
	/** Unmetered callers omit it. */
	withinPromptPool?: boolean;
}

/** Hours between runs for a daily rate, guarding the zero a paused plan carries. */
function intervalForRate(runsPerDay: number): number {
	return 24 / Math.max(1, runsPerDay);
}

function unlimitedRunPlan(input: ResolveRunPlanInput): PromptRunPlan {
	const interval = input.brand.delayOverrideHours ?? input.defaultDelayHours;
	// A pick can outlive its target: a retired scrape target is skipped when
	// SCRAPE_TARGETS is parsed. The brand's other picks should keep running, so
	// only a name Elmo has never tracked still fails.
	const configured = new Set(input.scrapeTargets.map((target) => target.model));
	const picks = input.brand.enabledModels?.filter((model) => configured.has(model) || !(model in KNOWN_MODELS)) ?? null;
	const targets = selectTargetsForBrand(input.scrapeTargets, picks).map((config) => ({
		config,
		intervalHours: interval,
		replication: getRunsPerPrompt(),
	}));
	return { targets, rescheduleHours: targets.length > 0 ? interval : null };
}

/** A pick always means the ungrounded target, so picking a premium model can't quietly buy the grounded call. */
function standardTargets(input: ResolveRunPlanInput, intervalHours: number, replication: number): TargetPlan[] {
	return resolveBrandPicks(input.entitlements, input.brand, input.scrapeTargets)
		.map((model) => input.scrapeTargets.find((t) => t.model === model && !isGroundedApiTarget(t)))
		.filter((config) => config !== undefined)
		.map((config) => ({ config, intervalHours, replication }));
}

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

	// A stored override can be faster than the plan after a downgrade, so it is
	// clamped here too. It governs both tiers: it only ever means "sample me less".
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
 * The run policy, the LLM settings page and the prompts view all ask this, so a
 * brand with no stored picks reads as its plan defaults everywhere.
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

/** Written at brand creation, and applied by the run policy when picks are null. */
export function defaultPlatformPicks(entitlements: Entitlements, scrapeTargets: ModelConfig[]): string[] {
	// Only an ungrounded target makes a model pickable; grounded ones belong to the premium pool.
	const available = new Set(scrapeTargets.filter((t) => !isGroundedApiTarget(t)).map((t) => t.model));
	return (entitlements.platformMenu ?? [])
		.filter((model) => available.has(model))
		.slice(0, entitlements.platformPicks ?? 0);
}

/**
 * Includes the provider: ChatGPT scraped and grounded are both `chatgpt` with web
 * search on, and sharing a slot would keep the grounded one from coming due. Keys
 * are computed, never stored, so changing this shape needs no reprocessing.
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

/** A slightly early job still runs instead of skipping a cycle; capped so long cadences can't double-run. */
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
 * Unlike `isTargetDue`, which leans early, this leans late: it asks whether
 * something is wrong. Failed runs record no row, so a target broken on one
 * provider shows up even while its siblings stay fresh.
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

/** From plan limits rather than usage, with headroom, so it stops runaways without limiting real runs. */
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
