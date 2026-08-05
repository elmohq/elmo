import { resolveEntitlements } from "@workspace/config/entitlements";
import { describe, expect, it } from "vitest";
import { nextFutureDueAt, resolveRuntimeTrackingPolicy, stableTrackingId, utcDayWindow } from "./tracking-policy";

describe("cloud runtime tracking policy", () => {
	it("creates deterministic, namespaced tracking ids", () => {
		const first = stableTrackingId("task", "occurrence-1", 0);
		expect(first).toBe(stableTrackingId("task", "occurrence-1", 0));
		expect(first).not.toBe(stableTrackingId("task", "occurrence-1", 1));
		expect(first).not.toBe(stableTrackingId("occurrence", "occurrence-1", 0));
		expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it("skips missed intervals without changing the materialized due time", () => {
		const dueAt = new Date("2026-08-05T00:00:00.000Z");
		const now = new Date("2026-08-05T13:01:00.000Z");
		expect(nextFutureDueAt(dueAt, 360, now).toISOString()).toBe("2026-08-05T18:00:00.000Z");
	});

	it("uses UTC calendar days for usage windows", () => {
		const window = utcDayWindow(new Date("2026-08-05T23:59:59.999Z"));
		expect(window.periodStart.toISOString()).toBe("2026-08-05T00:00:00.000Z");
		expect(window.periodEnd.toISOString()).toBe("2026-08-06T00:00:00.000Z");
	});

	it("derives a daily standard safety budget from current plan limits", () => {
		const resolved = resolveEntitlements({
			mode: "cloud",
			subscription: {
				planId: "pro",
				status: "active",
				currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
				delinquentSince: null,
			},
		});
		expect(
			resolveRuntimeTrackingPolicy({
				resolved,
				assignmentSource: "brand_selection",
				targetKey: "chatgpt",
				cadenceMinutes: 360,
				samplesPerOccurrence: 1,
			}),
		).toEqual({ usageClass: "standard", quotaKey: "standard-daily-v1", limitUnits: 2400 });
	});

	it("shares one premium daily budget across Claude modes and rejects invalid surfaces", () => {
		const resolved = resolveEntitlements({
			mode: "cloud",
			subscription: {
				planId: "pro",
				status: "active",
				currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
				delinquentSince: null,
				claudeAddonPromptSlots: 5,
			},
		});
		const nativePolicy = resolveRuntimeTrackingPolicy({
			resolved,
			assignmentSource: "premium",
			targetKey: "claude-native-web",
			cadenceMinutes: 1440,
			samplesPerOccurrence: 1,
		});
		const basePolicy = resolveRuntimeTrackingPolicy({
			resolved,
			assignmentSource: "premium",
			targetKey: "claude-base-model",
			cadenceMinutes: 1440,
			samplesPerOccurrence: 1,
		});
		expect(nativePolicy).toEqual({ usageClass: "premium", quotaKey: "claude-daily-v1", limitUnits: 25 });
		expect(basePolicy).toEqual(nativePolicy);
		expect(
			resolveRuntimeTrackingPolicy({
				resolved,
				assignmentSource: "premium",
				targetKey: "claude",
				cadenceMinutes: 1440,
				samplesPerOccurrence: 1,
			}),
		).toBeNull();
	});

	it("honors the custom contract's allowed Claude modes", () => {
		const resolved = resolveEntitlements({
			mode: "cloud",
			subscription: {
				planId: "custom",
				status: "active",
				currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
				delinquentSince: null,
				entitlementOverride: {
					version: 1,
					entitlements: {
						brandSlots: 1,
						promptSlots: 10,
						trackingTargets: {
							mode: "fixed",
							minimumSelected: 1,
							maximumSelected: 1,
							targets: [
								{
									targetKey: "chatgpt",
									schedule: {
										cadenceMinutes: 1440,
										samplesPerEvaluation: 1,
										cadencePolicy: { mode: "fixed" },
									},
								},
							],
						},
						claudeTracking: {
							enabled: true,
							allowedModes: ["base-model"],
							includedPromptSlots: 10,
							addon: { enabled: false, maximumAdditionalPromptSlots: 0 },
							schedule: {
								cadenceMinutes: 1440,
								samplesPerEvaluation: 1,
								cadencePolicy: { mode: "fixed" },
							},
						},
					},
				},
			},
		});
		expect(
			resolveRuntimeTrackingPolicy({
				resolved,
				assignmentSource: "custom",
				targetKey: "claude-base-model",
				cadenceMinutes: 1440,
				samplesPerOccurrence: 1,
			}),
		).toEqual({ usageClass: "custom", quotaKey: "custom-claude-daily-v1", limitUnits: 10 });
		expect(
			resolveRuntimeTrackingPolicy({
				resolved,
				assignmentSource: "custom",
				targetKey: "claude-native-web",
				cadenceMinutes: 1440,
				samplesPerOccurrence: 1,
			}),
		).toBeNull();
	});
});
