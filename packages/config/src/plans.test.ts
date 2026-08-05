import { describe, expect, it } from "vitest";
import {
	CLAUDE_TRACKING_MODES,
	CLOUD_CLAUDE_PROMPT_ADDON,
	CLOUD_PLAN_CATALOG,
	MINIMUM_CLOUD_CADENCE_MINUTES,
	organizationEntitlementOverrideSchema,
	STANDARD_TRACKING_TARGETS,
} from "./plans";

const fixedSchedule = (cadenceMinutes: number, samplesPerEvaluation: number) => ({
	cadenceMinutes,
	samplesPerEvaluation,
	cadencePolicy: { mode: "fixed" as const },
});

function validCustomOverride() {
	return {
		version: 1 as const,
		entitlements: {
			brandSlots: 12,
			promptSlots: 800,
			trackingTargets: {
				mode: "configurable" as const,
				minimumSelected: 1,
				maximumSelected: 2,
				targets: [
					{
						targetKey: "gpt-5-search",
						schedule: {
							cadenceMinutes: 240,
							samplesPerEvaluation: 2,
							cadencePolicy: {
								mode: "configurable" as const,
								minimumCadenceMinutes: 240,
								maximumCadenceMinutes: 1440,
							},
						},
					},
					{
						targetKey: "customer-api-target",
						schedule: fixedSchedule(720, 3),
					},
				],
			},
			claudeTracking: {
				enabled: true as const,
				allowedModes: [...CLAUDE_TRACKING_MODES],
				includedPromptSlots: 100,
				addon: { enabled: true, maximumAdditionalPromptSlots: 200 },
				schedule: fixedSchedule(1440, 1),
			},
		},
	};
}

describe("cloud plan catalog", () => {
	it("matches the five launch plans and self-serve prices", () => {
		expect(Object.keys(CLOUD_PLAN_CATALOG)).toEqual(["starter", "basic", "pro", "business", "custom"]);

		expect(CLOUD_PLAN_CATALOG.starter.billing).toMatchObject({
			kind: "self-serve",
			monthly: { unitAmountCents: 2900 },
			annual: { unitAmountCents: 29_000 },
		});
		expect(CLOUD_PLAN_CATALOG.basic.billing).toMatchObject({
			monthly: { unitAmountCents: 9900 },
			annual: { unitAmountCents: 99_000 },
		});
		expect(CLOUD_PLAN_CATALOG.pro.billing).toMatchObject({ monthly: { unitAmountCents: 29_900 } });
		expect(CLOUD_PLAN_CATALOG.business.billing).toMatchObject({ monthly: { unitAmountCents: 64_900 } });
		expect(CLOUD_PLAN_CATALOG.custom.billing).toEqual({ kind: "custom" });
	});

	it("gives Starter one fixed ChatGPT target with one daily sample", () => {
		const entitlements = CLOUD_PLAN_CATALOG.starter.entitlements.value;
		expect(entitlements.brandSlots).toBe(1);
		expect(entitlements.promptSlots).toBe(50);
		expect(entitlements.trackingTargets).toEqual({
			mode: "fixed",
			minimumSelected: 1,
			maximumSelected: 1,
			targets: [
				{
					targetKey: "chatgpt",
					schedule: fixedSchedule(1440, 1),
				},
			],
		});
		expect(entitlements.claudeTracking.enabled).toBe(false);
	});

	it("gives Basic four configurable standard targets at four separate evaluations per day", () => {
		const entitlements = CLOUD_PLAN_CATALOG.basic.entitlements.value;
		expect(entitlements.brandSlots).toBe(1);
		expect(entitlements.promptSlots).toBe(50);
		expect(entitlements.trackingTargets.maximumSelected).toBe(4);
		expect(entitlements.trackingTargets.targets.map((target) => target.targetKey)).toEqual([
			...STANDARD_TRACKING_TARGETS,
		]);
		expect(entitlements.trackingTargets.targets.every((target) => target.schedule.cadenceMinutes === 360)).toBe(true);
		expect(entitlements.trackingTargets.targets.every((target) => target.schedule.samplesPerEvaluation === 1)).toBe(
			true,
		);
		expect(entitlements.claudeTracking.enabled).toBe(false);
	});

	it("keeps Claude prompt assignments and paid additions separate from tracked prompt capacity", () => {
		const pro = CLOUD_PLAN_CATALOG.pro.entitlements.value;
		const business = CLOUD_PLAN_CATALOG.business.entitlements.value;

		expect(pro).toMatchObject({ brandSlots: 2, promptSlots: 150 });
		expect(pro.claudeTracking).toMatchObject({
			enabled: true,
			allowedModes: ["native-web-search"],
			includedPromptSlots: 20,
			addon: { enabled: true, maximumAdditionalPromptSlots: 130 },
			schedule: { cadenceMinutes: 1440, samplesPerEvaluation: 1 },
		});
		expect(business).toMatchObject({ brandSlots: 5, promptSlots: 350 });
		expect(business.claudeTracking).toMatchObject({
			includedPromptSlots: 30,
			addon: { maximumAdditionalPromptSlots: 320 },
		});
		expect(CLOUD_CLAUDE_PROMPT_ADDON).toMatchObject({
			monthly: { unitAmountCents: 500 },
			annual: { unitAmountCents: 5000 },
		});
	});

	it("requires a complete versioned custom contract and permits per-target schedules", () => {
		const override = validCustomOverride();
		const parsed = organizationEntitlementOverrideSchema.parse(override);
		expect(parsed.entitlements.trackingTargets.targets.map((target) => target.schedule)).toEqual([
			{
				cadenceMinutes: 240,
				samplesPerEvaluation: 2,
				cadencePolicy: { mode: "configurable", minimumCadenceMinutes: 240, maximumCadenceMinutes: 1440 },
			},
			fixedSchedule(720, 3),
		]);

		expect(
			organizationEntitlementOverrideSchema.safeParse({
				version: 1,
				entitlements: { brandSlots: 12 },
			}).success,
		).toBe(false);
		expect(organizationEntitlementOverrideSchema.safeParse({ ...override, unrecognized: true }).success).toBe(false);
	});

	it("rejects internally inconsistent or faster-than-contract custom policies", () => {
		const duplicateTargets = validCustomOverride();
		for (const target of duplicateTargets.entitlements.trackingTargets.targets) target.targetKey = "gpt-5-search";
		expect(organizationEntitlementOverrideSchema.safeParse(duplicateTargets).success).toBe(false);

		const tooFast = validCustomOverride();
		const tooFastTarget = tooFast.entitlements.trackingTargets.targets[0];
		if (!tooFastTarget) throw new Error("Expected a target fixture");
		tooFastTarget.schedule.cadenceMinutes = MINIMUM_CLOUD_CADENCE_MINUTES - 1;
		expect(organizationEntitlementOverrideSchema.safeParse(tooFast).success).toBe(false);

		const invalidCadenceRange = validCustomOverride();
		const invalidCadenceTarget = invalidCadenceRange.entitlements.trackingTargets.targets[0];
		if (!invalidCadenceTarget) throw new Error("Expected a target fixture");
		invalidCadenceTarget.schedule.cadencePolicy = {
			mode: "configurable",
			minimumCadenceMinutes: 1440,
			maximumCadenceMinutes: 240,
		};
		expect(organizationEntitlementOverrideSchema.safeParse(invalidCadenceRange).success).toBe(false);

		const excessClaudeCapacity = validCustomOverride();
		excessClaudeCapacity.entitlements.claudeTracking.includedPromptSlots = 700;
		excessClaudeCapacity.entitlements.claudeTracking.addon.maximumAdditionalPromptSlots = 200;
		expect(organizationEntitlementOverrideSchema.safeParse(excessClaudeCapacity).success).toBe(false);
	});
});
