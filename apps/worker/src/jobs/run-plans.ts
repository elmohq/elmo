import {
	computePoolPositions,
	type PromptRunPlan,
	type ResolveRunPlanInput,
	resolvePromptRunPlan,
} from "@workspace/lib/run-policy";

type ClaudeMode = ResolveRunPlanInput["prompt"]["claudeMode"];

export interface ResolveBrandPromptRunPlansInput {
	mode: ResolveRunPlanInput["mode"];
	scrapeTargets: ResolveRunPlanInput["scrapeTargets"];
	defaultDelayHours: number;
	entitlements: ResolveRunPlanInput["entitlements"];
	/**
	 * Every enabled prompt in the org — the pool ordering basis. Unused when
	 * entitlements are unlimited, so non-cloud callers can pass [] and read
	 * nothing extra.
	 */
	orgPrompts: { id: string; createdAt: Date; claudeMode: ClaudeMode }[];
	brand: ResolveRunPlanInput["brand"];
	prompts: { id: string; claudeMode: ClaudeMode }[];
}

/**
 * Entitlement pool positions plus a fresh run plan for each of one brand's
 * prompts — the shared shape behind process-prompt (a single prompt per
 * firing) and schedule-maintenance (every prompt of every brand per tick).
 */
export function resolveBrandPromptRunPlans(input: ResolveBrandPromptRunPlansInput): Map<string, PromptRunPlan> {
	const pools = input.entitlements.unlimited
		? null
		: computePoolPositions(input.orgPrompts, {
				maxPrompts: input.entitlements.maxPrompts,
				claudePool: input.entitlements.claudePool,
			});

	const plans = new Map<string, PromptRunPlan>();
	for (const prompt of input.prompts) {
		plans.set(
			prompt.id,
			resolvePromptRunPlan({
				mode: input.mode,
				scrapeTargets: input.scrapeTargets,
				brand: input.brand,
				prompt: { claudeMode: prompt.claudeMode },
				entitlements: input.entitlements,
				defaultDelayHours: input.defaultDelayHours,
				withinPromptPool: pools ? pools.withinPromptPool.has(prompt.id) : true,
				withinClaudePool: pools ? pools.withinClaudePool.has(prompt.id) : true,
			}),
		);
	}
	return plans;
}
