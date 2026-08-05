import { z } from "zod";

export const CLOUD_PLAN_IDS = ["starter", "basic", "pro", "business", "custom"] as const;
export const SELF_SERVE_CLOUD_PLAN_IDS = ["starter", "basic", "pro", "business"] as const;

export type CloudPlanId = (typeof CLOUD_PLAN_IDS)[number];
export type SelfServeCloudPlanId = (typeof SELF_SERVE_CLOUD_PLAN_IDS)[number];

export const STANDARD_TRACKING_TARGETS = [
	"chatgpt",
	"google-ai-mode",
	"google-ai-overview",
	"copilot",
	"perplexity",
	"gemini",
	"qwen",
	"deepseek",
] as const;

export type StandardTrackingTarget = (typeof STANDARD_TRACKING_TARGETS)[number];

export const CLAUDE_TRACKING_MODES = ["base-model", "native-web-search"] as const;
export type ClaudeTrackingMode = (typeof CLAUDE_TRACKING_MODES)[number];

export const CUSTOM_ENTITLEMENT_OVERRIDE_VERSION = 1 as const;
export const MINIMUM_CLOUD_CADENCE_MINUTES = Math.ceil(1440 / 7);

const nonNegativeSlotCountSchema = z.number().int().nonnegative();
const positiveSlotCountSchema = z.number().int().positive();

export const trackingTargetKeySchema = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[a-z0-9][a-z0-9-]*$/, "Target keys must use lowercase letters, numbers, and hyphens");

export const trackingScheduleSchema = z
	.object({
		cadenceMinutes: z.number().int().min(MINIMUM_CLOUD_CADENCE_MINUTES),
		samplesPerEvaluation: z.number().int().positive(),
	})
	.strict();

export type TrackingSchedule = z.infer<typeof trackingScheduleSchema>;

export const trackingTargetPolicySchema = z
	.object({
		targetKey: trackingTargetKeySchema,
		schedule: trackingScheduleSchema,
	})
	.strict();

export type TrackingTargetPolicy = z.infer<typeof trackingTargetPolicySchema>;

export const trackingTargetSelectionSchema = z
	.object({
		mode: z.enum(["fixed", "configurable"]),
		minimumSelected: nonNegativeSlotCountSchema,
		maximumSelected: nonNegativeSlotCountSchema,
		targets: z.array(trackingTargetPolicySchema),
	})
	.strict()
	.superRefine((selection, context) => {
		const targetKeys = selection.targets.map((target) => target.targetKey);
		if (new Set(targetKeys).size !== targetKeys.length) {
			context.addIssue({
				code: "custom",
				message: "Tracking target keys must be unique",
				path: ["targets"],
			});
		}

		if (selection.minimumSelected > selection.maximumSelected) {
			context.addIssue({
				code: "custom",
				message: "minimumSelected cannot exceed maximumSelected",
				path: ["minimumSelected"],
			});
		}

		if (selection.maximumSelected > selection.targets.length) {
			context.addIssue({
				code: "custom",
				message: "maximumSelected cannot exceed the number of available targets",
				path: ["maximumSelected"],
			});
		}

		if (
			selection.mode === "fixed" &&
			(selection.minimumSelected !== selection.targets.length || selection.maximumSelected !== selection.targets.length)
		) {
			context.addIssue({
				code: "custom",
				message: "A fixed selection must include every configured target",
				path: ["mode"],
			});
		}
	});

export type TrackingTargetSelection = z.infer<typeof trackingTargetSelectionSchema>;

const claudeAddonSchema = z
	.object({
		enabled: z.boolean(),
		maximumAdditionalPromptSlots: nonNegativeSlotCountSchema,
	})
	.strict()
	.superRefine((addon, context) => {
		if (!addon.enabled && addon.maximumAdditionalPromptSlots !== 0) {
			context.addIssue({
				code: "custom",
				message: "A disabled Claude add-on must have zero additional prompt slots",
				path: ["maximumAdditionalPromptSlots"],
			});
		}
	});

const disabledClaudeTrackingSchema = z
	.object({
		enabled: z.literal(false),
		allowedModes: z.array(z.enum(CLAUDE_TRACKING_MODES)).length(0),
		includedPromptSlots: z.literal(0),
		addon: z.object({ enabled: z.literal(false), maximumAdditionalPromptSlots: z.literal(0) }).strict(),
		schedule: z.null(),
	})
	.strict();

const enabledClaudeTrackingSchema = z
	.object({
		enabled: z.literal(true),
		allowedModes: z.array(z.enum(CLAUDE_TRACKING_MODES)).min(1),
		includedPromptSlots: nonNegativeSlotCountSchema,
		addon: claudeAddonSchema,
		schedule: trackingScheduleSchema,
	})
	.strict()
	.superRefine((claude, context) => {
		if (new Set(claude.allowedModes).size !== claude.allowedModes.length) {
			context.addIssue({
				code: "custom",
				message: "Claude tracking modes must be unique",
				path: ["allowedModes"],
			});
		}
	});

export const claudeTrackingSchema = z.discriminatedUnion("enabled", [
	disabledClaudeTrackingSchema,
	enabledClaudeTrackingSchema,
]);

export type ClaudeTrackingDefinition = z.infer<typeof claudeTrackingSchema>;

export const planEntitlementDefinitionSchema = z
	.object({
		brandSlots: positiveSlotCountSchema,
		promptSlots: positiveSlotCountSchema,
		trackingTargets: trackingTargetSelectionSchema,
		claudeTracking: claudeTrackingSchema,
	})
	.strict()
	.superRefine((entitlements, context) => {
		if (!entitlements.claudeTracking.enabled) return;

		const maximumClaudePromptSlots =
			entitlements.claudeTracking.includedPromptSlots + entitlements.claudeTracking.addon.maximumAdditionalPromptSlots;
		if (maximumClaudePromptSlots > entitlements.promptSlots) {
			context.addIssue({
				code: "custom",
				message: "Claude prompt slots cannot exceed the plan's tracked prompt slots",
				path: ["claudeTracking", "addon", "maximumAdditionalPromptSlots"],
			});
		}
	});

export type PlanEntitlementDefinition = z.infer<typeof planEntitlementDefinitionSchema>;

export const organizationEntitlementOverrideSchema = z
	.object({
		version: z.literal(CUSTOM_ENTITLEMENT_OVERRIDE_VERSION),
		entitlements: planEntitlementDefinitionSchema,
	})
	.strict();

export type OrganizationEntitlementOverride = z.infer<typeof organizationEntitlementOverrideSchema>;

interface StripePriceReference {
	lookupKey: string;
	unitAmountCents: number;
}

interface SelfServeBillingDefinition {
	kind: "self-serve";
	currency: "usd";
	monthly: StripePriceReference;
	annual: StripePriceReference;
}

interface CustomBillingDefinition {
	kind: "custom";
}

interface CatalogEntitlementSource {
	kind: "catalog";
	value: PlanEntitlementDefinition;
}

interface CustomEntitlementSource {
	kind: "organization-override";
	version: typeof CUSTOM_ENTITLEMENT_OVERRIDE_VERSION;
}

export interface CloudPlanCatalogEntry {
	id: CloudPlanId;
	displayName: string;
	billing: SelfServeBillingDefinition | CustomBillingDefinition;
	entitlements: CatalogEntitlementSource | CustomEntitlementSource;
}

function schedule(cadenceMinutes: number): TrackingSchedule {
	return { cadenceMinutes, samplesPerEvaluation: 1 };
}

function targetPolicies(targetKeys: readonly StandardTrackingTarget[], cadenceMinutes: number): TrackingTargetPolicy[] {
	return targetKeys.map((targetKey) => ({ targetKey, schedule: schedule(cadenceMinutes) }));
}

function disabledClaudeTracking(): ClaudeTrackingDefinition {
	return {
		enabled: false,
		allowedModes: [],
		includedPromptSlots: 0,
		addon: { enabled: false, maximumAdditionalPromptSlots: 0 },
		schedule: null,
	};
}

function enabledClaudeTracking(includedPromptSlots: number, promptSlots: number): ClaudeTrackingDefinition {
	return {
		enabled: true,
		allowedModes: ["native-web-search"],
		includedPromptSlots,
		addon: {
			enabled: true,
			maximumAdditionalPromptSlots: promptSlots - includedPromptSlots,
		},
		schedule: schedule(1440),
	};
}

function defineEntitlements(value: PlanEntitlementDefinition): PlanEntitlementDefinition {
	return planEntitlementDefinitionSchema.parse(value);
}

function selfServeBilling(planId: SelfServeCloudPlanId, monthlyAmountCents: number): SelfServeBillingDefinition {
	return {
		kind: "self-serve",
		currency: "usd",
		monthly: {
			lookupKey: `elmo_cloud_${planId}_monthly`,
			unitAmountCents: monthlyAmountCents,
		},
		annual: {
			lookupKey: `elmo_cloud_${planId}_annual`,
			unitAmountCents: monthlyAmountCents * 10,
		},
	};
}

const standardTargetsFourTimesDaily = () => targetPolicies(STANDARD_TRACKING_TARGETS, 360);

export const CLOUD_CLAUDE_PROMPT_ADDON = {
	currency: "usd",
	monthly: {
		lookupKey: "elmo_cloud_claude_prompt_monthly",
		unitAmountCents: 500,
	},
	annual: {
		lookupKey: "elmo_cloud_claude_prompt_annual",
		unitAmountCents: 5000,
	},
} as const;

export const CLOUD_PLAN_CATALOG = {
	starter: {
		id: "starter",
		displayName: "Starter",
		billing: selfServeBilling("starter", 2900),
		entitlements: {
			kind: "catalog",
			value: defineEntitlements({
				brandSlots: 1,
				promptSlots: 50,
				trackingTargets: {
					mode: "fixed",
					minimumSelected: 1,
					maximumSelected: 1,
					targets: targetPolicies(["chatgpt"], 1440),
				},
				claudeTracking: disabledClaudeTracking(),
			}),
		},
	},
	basic: {
		id: "basic",
		displayName: "Basic",
		billing: selfServeBilling("basic", 9900),
		entitlements: {
			kind: "catalog",
			value: defineEntitlements({
				brandSlots: 1,
				promptSlots: 50,
				trackingTargets: {
					mode: "configurable",
					minimumSelected: 1,
					maximumSelected: 4,
					targets: standardTargetsFourTimesDaily(),
				},
				claudeTracking: disabledClaudeTracking(),
			}),
		},
	},
	pro: {
		id: "pro",
		displayName: "Pro",
		billing: selfServeBilling("pro", 29_900),
		entitlements: {
			kind: "catalog",
			value: defineEntitlements({
				brandSlots: 2,
				promptSlots: 150,
				trackingTargets: {
					mode: "configurable",
					minimumSelected: 1,
					maximumSelected: 4,
					targets: standardTargetsFourTimesDaily(),
				},
				claudeTracking: enabledClaudeTracking(20, 150),
			}),
		},
	},
	business: {
		id: "business",
		displayName: "Business",
		billing: selfServeBilling("business", 64_900),
		entitlements: {
			kind: "catalog",
			value: defineEntitlements({
				brandSlots: 5,
				promptSlots: 350,
				trackingTargets: {
					mode: "configurable",
					minimumSelected: 1,
					maximumSelected: 4,
					targets: standardTargetsFourTimesDaily(),
				},
				claudeTracking: enabledClaudeTracking(30, 350),
			}),
		},
	},
	custom: {
		id: "custom",
		displayName: "Custom",
		billing: { kind: "custom" },
		entitlements: {
			kind: "organization-override",
			version: CUSTOM_ENTITLEMENT_OVERRIDE_VERSION,
		},
	},
} satisfies { [PlanId in CloudPlanId]: CloudPlanCatalogEntry & { id: PlanId } };

export function isCloudPlanId(value: string): value is CloudPlanId {
	return CLOUD_PLAN_IDS.includes(value as CloudPlanId);
}

export function getCloudPlan(value: string): CloudPlanCatalogEntry | undefined {
	return isCloudPlanId(value) ? CLOUD_PLAN_CATALOG[value] : undefined;
}
