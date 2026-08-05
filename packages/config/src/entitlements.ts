import { z } from "zod";
import {
	type ClaudeTrackingDefinition,
	type CloudPlanId,
	getCloudPlan,
	organizationEntitlementOverrideSchema,
	type PlanEntitlementDefinition,
	type TrackingTargetSelection,
} from "./plans";
import type { DeploymentMode } from "./types";

export interface CloudSubscriptionEntitlementSnapshot {
	planId: string;
	status: string;
	claudeAddonPromptSlots?: number;
	entitlementOverride?: unknown;
}

export interface ResolveEntitlementsInput {
	mode: DeploymentMode;
	subscription?: CloudSubscriptionEntitlementSnapshot | null;
}

export interface LegacyUnlimitedEntitlements {
	kind: "legacy-unlimited";
	brandSlots: null;
	promptSlots: null;
	trackingTargets: {
		kind: "legacy-config";
	};
	claudeTracking: {
		kind: "legacy-config";
		promptSlots: null;
		addon: {
			enabled: false;
		};
	};
}

export type ResolvedCloudClaudeTracking =
	| (Extract<ClaudeTrackingDefinition, { enabled: false }> & {
			purchasedAddonPromptSlots: 0;
			totalPromptSlots: 0;
	  })
	| (Extract<ClaudeTrackingDefinition, { enabled: true }> & {
			purchasedAddonPromptSlots: number;
			totalPromptSlots: number;
	  });

export interface ResolvedCloudPlanEntitlements {
	brandSlots: number;
	promptSlots: number;
	trackingTargets: TrackingTargetSelection;
	claudeTracking: ResolvedCloudClaudeTracking;
}

export type CloudEntitlementDenialReason =
	| "missing-subscription"
	| "inactive-subscription"
	| "unknown-plan"
	| "custom-override-required"
	| "invalid-custom-override"
	| "unexpected-standard-plan-override"
	| "invalid-claude-addon";

export type ResolvedEntitlements =
	| {
			mode: Exclude<DeploymentMode, "cloud">;
			access: "allowed";
			source: { kind: "legacy" };
			entitlements: LegacyUnlimitedEntitlements;
	  }
	| {
			mode: "cloud";
			access: "allowed";
			source:
				| { kind: "catalog"; planId: Exclude<CloudPlanId, "custom"> }
				| { kind: "organization-override"; planId: "custom"; version: 1 };
			entitlements: ResolvedCloudPlanEntitlements;
	  }
	| {
			mode: "cloud";
			access: "denied";
			reason: CloudEntitlementDenialReason;
			source: { kind: "none" };
			entitlements: ResolvedCloudPlanEntitlements;
	  };

export const LEGACY_UNLIMITED_ENTITLEMENTS: LegacyUnlimitedEntitlements = {
	kind: "legacy-unlimited",
	brandSlots: null,
	promptSlots: null,
	trackingTargets: { kind: "legacy-config" },
	claudeTracking: {
		kind: "legacy-config",
		promptSlots: null,
		addon: { enabled: false },
	},
};

export const DENIED_CLOUD_ENTITLEMENTS: ResolvedCloudPlanEntitlements = {
	brandSlots: 0,
	promptSlots: 0,
	trackingTargets: {
		mode: "fixed",
		minimumSelected: 0,
		maximumSelected: 0,
		targets: [],
	},
	claudeTracking: {
		enabled: false,
		allowedModes: [],
		includedPromptSlots: 0,
		addon: { enabled: false, maximumAdditionalPromptSlots: 0 },
		schedule: null,
		purchasedAddonPromptSlots: 0,
		totalPromptSlots: 0,
	},
};

const claudeAddonPromptSlotsSchema = z.number().int().nonnegative();

function deny(reason: CloudEntitlementDenialReason): ResolvedEntitlements {
	return {
		mode: "cloud",
		access: "denied",
		reason,
		source: { kind: "none" },
		entitlements: DENIED_CLOUD_ENTITLEMENTS,
	};
}

function resolveCloudPlanEntitlements(
	definition: PlanEntitlementDefinition,
	purchasedAddonPromptSlots: number,
): ResolvedCloudPlanEntitlements | null {
	if (!definition.claudeTracking.enabled) {
		if (purchasedAddonPromptSlots !== 0) return null;
		return {
			...definition,
			claudeTracking: {
				...definition.claudeTracking,
				purchasedAddonPromptSlots: 0,
				totalPromptSlots: 0,
			},
		};
	}

	if (!definition.claudeTracking.addon.enabled && purchasedAddonPromptSlots !== 0) return null;
	if (purchasedAddonPromptSlots > definition.claudeTracking.addon.maximumAdditionalPromptSlots) return null;

	return {
		...definition,
		claudeTracking: {
			...definition.claudeTracking,
			purchasedAddonPromptSlots,
			totalPromptSlots: definition.claudeTracking.includedPromptSlots + purchasedAddonPromptSlots,
		},
	};
}

export function resolveEntitlements(input: ResolveEntitlementsInput): ResolvedEntitlements {
	if (input.mode !== "cloud") {
		return {
			mode: input.mode,
			access: "allowed",
			source: { kind: "legacy" },
			entitlements: LEGACY_UNLIMITED_ENTITLEMENTS,
		};
	}

	const subscription = input.subscription;
	if (!subscription) return deny("missing-subscription");
	if (subscription.status !== "active") return deny("inactive-subscription");

	const plan = getCloudPlan(subscription.planId);
	if (!plan) return deny("unknown-plan");

	let definition: PlanEntitlementDefinition;
	let source: Extract<ResolvedEntitlements, { mode: "cloud"; access: "allowed" }>["source"];
	if (plan.entitlements.kind === "organization-override") {
		if (subscription.entitlementOverride === null || subscription.entitlementOverride === undefined) {
			return deny("custom-override-required");
		}

		const override = organizationEntitlementOverrideSchema.safeParse(subscription.entitlementOverride);
		if (!override.success) return deny("invalid-custom-override");
		definition = override.data.entitlements;
		source = {
			kind: "organization-override",
			planId: "custom",
			version: override.data.version,
		};
	} else {
		if (subscription.entitlementOverride !== null && subscription.entitlementOverride !== undefined) {
			return deny("unexpected-standard-plan-override");
		}
		definition = plan.entitlements.value;
		source = { kind: "catalog", planId: plan.id as Exclude<CloudPlanId, "custom"> };
	}

	const addonSlots = claudeAddonPromptSlotsSchema.safeParse(subscription.claudeAddonPromptSlots ?? 0);
	if (!addonSlots.success) return deny("invalid-claude-addon");

	const entitlements = resolveCloudPlanEntitlements(definition, addonSlots.data);
	if (!entitlements) return deny("invalid-claude-addon");

	return {
		mode: "cloud",
		access: "allowed",
		source,
		entitlements,
	};
}
