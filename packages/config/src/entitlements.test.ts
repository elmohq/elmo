import { describe, expect, it } from "vitest";
import { type CloudSubscriptionEntitlementSnapshot, resolveEntitlements } from "./entitlements";
import { CLAUDE_TRACKING_MODES } from "./plans";

const fixedSchedule = (cadenceMinutes: number, samplesPerEvaluation: number) => ({
	cadenceMinutes,
	samplesPerEvaluation,
	cadencePolicy: { mode: "fixed" as const },
});

function activeSubscription(
	planId: string,
	overrides: Partial<CloudSubscriptionEntitlementSnapshot> = {},
): CloudSubscriptionEntitlementSnapshot {
	return { planId, status: "active", ...overrides };
}

function customOverride() {
	return {
		version: 1,
		entitlements: {
			brandSlots: 10,
			promptSlots: 500,
			trackingTargets: {
				mode: "configurable",
				minimumSelected: 1,
				maximumSelected: 2,
				targets: [
					{
						targetKey: "gpt-5-search",
						schedule: fixedSchedule(240, 1),
					},
					{
						targetKey: "customer-api-target",
						schedule: fixedSchedule(480, 4),
					},
				],
			},
			claudeTracking: {
				enabled: true,
				allowedModes: [...CLAUDE_TRACKING_MODES],
				includedPromptSlots: 75,
				addon: { enabled: true, maximumAdditionalPromptSlots: 125 },
				schedule: fixedSchedule(1440, 1),
			},
		},
	};
}

describe("resolveEntitlements", () => {
	it.each(["local", "demo", "whitelabel"] as const)(
		"leaves %s unlimited and governed by its legacy target configuration",
		(mode) => {
			const result = resolveEntitlements({
				mode,
				subscription: activeSubscription("does-not-matter"),
			});

			expect(result).toEqual({
				mode,
				access: "allowed",
				source: { kind: "legacy" },
				entitlements: {
					kind: "legacy-unlimited",
					brandSlots: null,
					promptSlots: null,
					trackingTargets: { kind: "legacy-config" },
					claudeTracking: {
						kind: "legacy-config",
						promptSlots: null,
						addon: { enabled: false },
					},
				},
			});
		},
	);

	it.each([
		[undefined, "missing-subscription"],
		[activeSubscription("pro", { billingMutationPending: true }), "billing-change-pending"],
		[activeSubscription("starter", { status: "trialing" }), "inactive-subscription"],
		[activeSubscription("future-plan"), "unknown-plan"],
	] as const)("fails closed for an unusable cloud subscription", (subscription, reason) => {
		const result = resolveEntitlements({ mode: "cloud", subscription });

		expect(result).toMatchObject({
			mode: "cloud",
			access: "denied",
			reason,
			entitlements: {
				brandSlots: 0,
				promptSlots: 0,
				trackingTargets: { maximumSelected: 0, targets: [] },
				claudeTracking: { totalPromptSlots: 0 },
			},
		});
	});

	it("resolves a catalog plan and adds only purchased Claude assignment slots", () => {
		const result = resolveEntitlements({
			mode: "cloud",
			subscription: activeSubscription("pro", { claudeAddonPromptSlots: 12 }),
		});

		expect(result).toMatchObject({
			access: "allowed",
			source: { kind: "catalog", planId: "pro" },
			entitlements: {
				brandSlots: 2,
				promptSlots: 150,
				trackingTargets: { maximumSelected: 4 },
				claudeTracking: {
					includedPromptSlots: 20,
					purchasedAddonPromptSlots: 12,
					totalPromptSlots: 32,
					schedule: { cadenceMinutes: 1440, samplesPerEvaluation: 1 },
				},
			},
		});
	});

	it.each([
		activeSubscription("basic", { claudeAddonPromptSlots: 1 }),
		activeSubscription("pro", { claudeAddonPromptSlots: 131 }),
		activeSubscription("pro", { claudeAddonPromptSlots: -1 }),
		activeSubscription("pro", { claudeAddonPromptSlots: 1.5 }),
	])("denies invalid Claude add-on projections without partially enabling the plan", (subscription) => {
		const result = resolveEntitlements({ mode: "cloud", subscription });
		expect(result).toMatchObject({
			access: "denied",
			reason: "invalid-claude-addon",
			entitlements: { brandSlots: 0, promptSlots: 0 },
		});
	});

	it("does not let standard plans receive ad-hoc entitlement overrides", () => {
		const result = resolveEntitlements({
			mode: "cloud",
			subscription: activeSubscription("starter", { entitlementOverride: customOverride() }),
		});

		expect(result).toMatchObject({
			access: "denied",
			reason: "unexpected-standard-plan-override",
			entitlements: { brandSlots: 0, promptSlots: 0 },
		});
	});

	it.each([
		[undefined, "custom-override-required"],
		[{ version: 1, entitlements: { brandSlots: 10 } }, "invalid-custom-override"],
		[{ ...customOverride(), version: 2 }, "invalid-custom-override"],
	] as const)("requires a valid complete custom contract", (entitlementOverride, reason) => {
		const result = resolveEntitlements({
			mode: "cloud",
			subscription: activeSubscription("custom", { entitlementOverride }),
		});

		expect(result).toMatchObject({
			access: "denied",
			reason,
			entitlements: { brandSlots: 0, promptSlots: 0 },
		});
	});

	it("resolves custom contracts without inheriting a public plan", () => {
		const result = resolveEntitlements({
			mode: "cloud",
			subscription: activeSubscription("custom", {
				entitlementOverride: customOverride(),
				claudeAddonPromptSlots: 25,
			}),
		});

		expect(result).toMatchObject({
			access: "allowed",
			source: { kind: "organization-override", planId: "custom", version: 1 },
			entitlements: {
				brandSlots: 10,
				promptSlots: 500,
				trackingTargets: {
					maximumSelected: 2,
					targets: [
						{ targetKey: "gpt-5-search", schedule: { cadenceMinutes: 240, samplesPerEvaluation: 1 } },
						{ targetKey: "customer-api-target", schedule: { cadenceMinutes: 480, samplesPerEvaluation: 4 } },
					],
				},
				claudeTracking: {
					includedPromptSlots: 75,
					purchasedAddonPromptSlots: 25,
					totalPromptSlots: 100,
				},
			},
		});
	});
});
