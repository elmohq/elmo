import {
	CLOUD_CLAUDE_PROMPT_ADDON,
	CLOUD_PLAN_CATALOG,
	SELF_SERVE_CLOUD_PLAN_IDS,
	type SelfServeCloudPlanId,
	STANDARD_TRACKING_TARGETS,
	type StandardTrackingTarget,
} from "@workspace/config/plans";

const TARGET_LABELS: Record<StandardTrackingTarget, string> = {
	chatgpt: "ChatGPT",
	"google-ai-mode": "Google AI Mode",
	"google-ai-overview": "Google AI Overviews",
	copilot: "Microsoft Copilot",
	perplexity: "Perplexity",
	gemini: "Gemini",
	qwen: "Qwen",
	deepseek: "DeepSeek",
};

export const STANDARD_CLOUD_PLATFORM_NAMES = STANDARD_TRACKING_TARGETS.map((target) => TARGET_LABELS[target]);

export interface PublicCloudPlan {
	id: SelfServeCloudPlanId;
	displayName: string;
	monthlyPrice: string;
	annualPrice: string;
	brandSlots: number;
	promptSlots: number;
	platformSelection: string;
	standardSamplesPerDay: number;
	claudePromptSlots: number;
	allowsClaudeAddon: boolean;
}

function samplesPerDay(cadenceMinutes: number): number {
	return Math.floor(1440 / cadenceMinutes);
}

function publicPlan(planId: SelfServeCloudPlanId): PublicCloudPlan {
	const plan = CLOUD_PLAN_CATALOG[planId];
	if (plan.billing.kind !== "self-serve" || plan.entitlements.kind !== "catalog") {
		throw new Error(`${planId} must have self-serve billing and catalog entitlements`);
	}

	const entitlements = plan.entitlements.value;
	const targetCadences = new Set(entitlements.trackingTargets.targets.map((target) => target.schedule.cadenceMinutes));
	if (targetCadences.size !== 1) throw new Error(`${planId} must publish one standard-platform cadence`);
	const cadenceMinutes = targetCadences.values().next().value;
	if (cadenceMinutes === undefined) throw new Error(`${planId} must publish at least one tracking target`);

	const targetNames = entitlements.trackingTargets.targets.map((target) => {
		if (!(target.targetKey in TARGET_LABELS)) throw new Error(`${target.targetKey} is missing a public label`);
		return TARGET_LABELS[target.targetKey as StandardTrackingTarget];
	});
	const platformSelection =
		entitlements.trackingTargets.mode === "fixed"
			? `${targetNames.join(", ")} only`
			: `Choose ${entitlements.trackingTargets.maximumSelected} of ${targetNames.length}`;

	return {
		id: plan.id,
		displayName: plan.displayName,
		monthlyPrice: formatUsd(plan.billing.monthly.unitAmountCents),
		annualPrice: formatUsd(plan.billing.annual.unitAmountCents),
		brandSlots: entitlements.brandSlots,
		promptSlots: entitlements.promptSlots,
		platformSelection,
		standardSamplesPerDay: samplesPerDay(cadenceMinutes),
		claudePromptSlots: entitlements.claudeTracking.enabled ? entitlements.claudeTracking.includedPromptSlots : 0,
		allowsClaudeAddon: entitlements.claudeTracking.enabled && entitlements.claudeTracking.addon.enabled,
	};
}

export const PUBLIC_CLOUD_PLANS = SELF_SERVE_CLOUD_PLAN_IDS.map(publicPlan);

export interface PublicCloudCatalog {
	plans: PublicCloudPlan[];
	standardPlatformNames: string[];
	claudeAddon: {
		monthlyPrice: string;
		annualPrice: string;
	};
}

export const PUBLIC_CLOUD_CATALOG: PublicCloudCatalog = {
	plans: PUBLIC_CLOUD_PLANS,
	standardPlatformNames: STANDARD_CLOUD_PLATFORM_NAMES,
	claudeAddon: {
		monthlyPrice: formatUsd(CLOUD_CLAUDE_PROMPT_ADDON.monthly.unitAmountCents),
		annualPrice: formatUsd(CLOUD_CLAUDE_PROMPT_ADDON.annual.unitAmountCents),
	},
};

export function formatUsd(amountCents: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(amountCents / 100);
}
