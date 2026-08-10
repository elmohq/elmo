/**
 * Pool positions plus a fresh run plan for every prompt of one brand — the
 * shared shape behind process-prompt (a single prompt per firing) and
 * schedule-maintenance (every prompt of every brand per tick).
 *
 * Pool membership is decided across the whole org while run plans resolve per
 * brand, so callers pass both: `orgPrompts` orders the org-wide pools and
 * `prompts` selects the subset to plan.
 */

import type { Entitlements } from "@workspace/config/entitlements";
import type { ModelConfig } from "@workspace/config/scrape-targets";
import { computePoolPositions } from "./maintenance";
import { type PromptRunPlan, resolvePromptRunPlan } from "./policy";

export interface ResolveBrandPromptRunPlansInput {
	scrapeTargets: ModelConfig[];
	defaultDelayHours: number;
	entitlements: Entitlements;
	/**
	 * Every enabled prompt in the org — the pool ordering basis. Unused when
	 * entitlements are unlimited, so non-cloud callers can pass [] and read
	 * nothing extra.
	 */
	orgPrompts: { id: string; createdAt: Date; premiumModels: string[] }[];
	brand: { enabledModels: string[] | null; delayOverrideHours: number | null };
	prompts: { id: string; premiumModels: string[] }[];
}

export function resolveBrandPromptRunPlans(input: ResolveBrandPromptRunPlansInput): Map<string, PromptRunPlan> {
	const pools = input.entitlements.unlimited
		? null
		: computePoolPositions(input.orgPrompts, {
				maxPrompts: input.entitlements.maxPrompts,
				premiumPool: input.entitlements.premiumPool,
			});

	const plans = new Map<string, PromptRunPlan>();
	for (const prompt of input.prompts) {
		plans.set(
			prompt.id,
			resolvePromptRunPlan({
				scrapeTargets: input.scrapeTargets,
				brand: input.brand,
				// Trimmed to what the pool covers, so the policy runs what the org has
				// paid for without re-deciding it.
				prompt: { premiumModels: pools ? (pools.premiumByPrompt.get(prompt.id) ?? []) : prompt.premiumModels },
				entitlements: input.entitlements,
				defaultDelayHours: input.defaultDelayHours,
				withinPromptPool: pools ? pools.withinPromptPool.has(prompt.id) : true,
			}),
		);
	}
	return plans;
}
