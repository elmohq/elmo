import { RUNS_PER_PROMPT } from "../constants";
import type { ModelConfig } from "./types";

export interface TargetRunPolicy {
	config: ModelConfig;
	replication: number;
	cadenceHours: number;
}

/** Org-level overrides for cloud custom plans, stored under the `runPolicy`
 *  key of better-auth `organization.metadata` (a JSON string column). The
 *  entitlement system will supersede this reader — keep the shape. */
export interface OrgRunPolicyOverrides {
	standardRunsPerDay?: number;
	claudeRunsPerDay?: number;
}

export const CLOUD_STANDARD_RUNS_PER_DAY = 4;
export const CLOUD_ANTHROPIC_RUNS_PER_DAY = 1;
export const CLOUD_MAX_RUNS_PER_DAY = 7;
export const CLOUD_CADENCE_FLOOR_HOURS = 24;

export function parseOrgRunPolicyOverrides(metadataJson: string | null | undefined): OrgRunPolicyOverrides | null {
	if (!metadataJson) return null;
	let metadata: unknown;
	try {
		metadata = JSON.parse(metadataJson);
	} catch {
		return null;
	}
	if (typeof metadata !== "object" || metadata === null) return null;
	const runPolicy = (metadata as Record<string, unknown>).runPolicy;
	if (typeof runPolicy !== "object" || runPolicy === null || Array.isArray(runPolicy)) return null;
	const raw = runPolicy as Record<string, unknown>;
	const overrides: OrgRunPolicyOverrides = {};
	if (
		typeof raw.standardRunsPerDay === "number" &&
		Number.isInteger(raw.standardRunsPerDay) &&
		raw.standardRunsPerDay >= 1
	) {
		overrides.standardRunsPerDay = raw.standardRunsPerDay;
	}
	if (typeof raw.claudeRunsPerDay === "number" && Number.isInteger(raw.claudeRunsPerDay) && raw.claudeRunsPerDay >= 1) {
		overrides.claudeRunsPerDay = raw.claudeRunsPerDay;
	}
	return overrides;
}

/**
 * Resolve the effective runs-per-firing and cadence for one target.
 *
 * Non-cloud: SCRAPE_TARGETS options win, then the deployment defaults — an
 * explicit per-target cadence beats the brand override because both are
 * operator-level knobs and the target one is scoped tighter.
 *
 * Cloud: org overrides beat SCRAPE_TARGETS beat the per-provider base, but the
 * result is always clamped to [1, CLOUD_MAX_RUNS_PER_DAY] and the cadence
 * floored at CLOUD_CADENCE_FLOOR_HOURS — plan config is not trusted to exceed
 * the platform bounds.
 */
export function resolveTargetRunPolicy(
	config: ModelConfig,
	ctx: {
		/** process.env.DEPLOYMENT_MODE convention; anything !== "cloud" is non-cloud. */
		deploymentMode: string;
		/** brand.delayOverrideHours ?? getDefaultDelayHours() */
		brandCadenceHours: number;
		orgOverrides?: OrgRunPolicyOverrides | null;
	},
): TargetRunPolicy {
	if (ctx.deploymentMode !== "cloud") {
		return {
			config,
			replication: config.replication ?? RUNS_PER_PROMPT,
			cadenceHours: config.cadenceHours ?? ctx.brandCadenceHours,
		};
	}
	const isAnthropic = config.provider === "anthropic-api";
	const base = isAnthropic ? CLOUD_ANTHROPIC_RUNS_PER_DAY : CLOUD_STANDARD_RUNS_PER_DAY;
	const orgOverride = isAnthropic ? ctx.orgOverrides?.claudeRunsPerDay : ctx.orgOverrides?.standardRunsPerDay;
	const requested = orgOverride ?? config.replication ?? base;
	return {
		config,
		replication: Math.min(CLOUD_MAX_RUNS_PER_DAY, Math.max(1, requested)),
		cadenceHours: Math.max(CLOUD_CADENCE_FLOOR_HOURS, config.cadenceHours ?? ctx.brandCadenceHours),
	};
}

/** Key for last-run lookups; provider may be null on legacy prompt_runs rows. */
export function lastRunKey(model: string, provider: string | null): string {
	return `${model}::${provider ?? ""}`;
}

/**
 * A target is due when it has never run or its cadence has fully elapsed.
 * Strict (no tolerance): the schedule is completion-anchored, so elapsed time
 * at the next firing is always >= the period — a strict check can
 * under-deliver by at most one firing under mixed cadences but never
 * over-deliver (never overspend).
 */
export function selectDueTargets(
	policies: TargetRunPolicy[],
	lastRunAtByKey: Map<string, Date>,
	now: Date,
): TargetRunPolicy[] {
	return policies.filter((policy) => {
		const keyed = lastRunAtByKey.get(lastRunKey(policy.config.model, policy.config.provider));
		// Legacy prompt_runs rows have a null provider; use the later timestamp.
		const legacy = lastRunAtByKey.get(lastRunKey(policy.config.model, null));
		const lastRunAt = keyed && legacy ? (keyed.getTime() >= legacy.getTime() ? keyed : legacy) : (keyed ?? legacy);
		if (!lastRunAt) return true;
		return now.getTime() - lastRunAt.getTime() >= policy.cadenceHours * 60 * 60 * 1000;
	});
}

export function minCadenceHours(policies: TargetRunPolicy[], fallback: number): number {
	if (policies.length === 0) return fallback;
	return Math.min(...policies.map((policy) => policy.cadenceHours));
}
