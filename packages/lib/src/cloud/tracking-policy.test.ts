import assert from "node:assert/strict";
import test from "node:test";
import { resolveEntitlements } from "@workspace/config/entitlements";
import { nextFutureDueAt, resolveRuntimeTrackingPolicy, stableTrackingId, utcDayWindow } from "./tracking-policy";

test("stable tracking ids are deterministic and namespaced", () => {
	const first = stableTrackingId("task", "occurrence-1", 0);
	assert.equal(first, stableTrackingId("task", "occurrence-1", 0));
	assert.notEqual(first, stableTrackingId("task", "occurrence-1", 1));
	assert.notEqual(first, stableTrackingId("occurrence", "occurrence-1", 0));
	assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("next due time skips missed intervals without changing the materialized due time", () => {
	const dueAt = new Date("2026-08-05T00:00:00.000Z");
	const now = new Date("2026-08-05T13:01:00.000Z");
	assert.equal(nextFutureDueAt(dueAt, 360, now).toISOString(), "2026-08-05T18:00:00.000Z");
});

test("usage windows are UTC calendar days", () => {
	const window = utcDayWindow(new Date("2026-08-05T23:59:59.999Z"));
	assert.equal(window.periodStart.toISOString(), "2026-08-05T00:00:00.000Z");
	assert.equal(window.periodEnd.toISOString(), "2026-08-06T00:00:00.000Z");
});

test("runtime policy derives a daily standard safety budget from current plan limits", () => {
	const resolved = resolveEntitlements({
		mode: "cloud",
		subscription: {
			planId: "pro",
			status: "active",
			currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
			delinquentSince: null,
		},
	});
	assert.deepEqual(
		resolveRuntimeTrackingPolicy({
			resolved,
			assignmentSource: "brand_selection",
			targetKey: "chatgpt",
			cadenceMinutes: 360,
			samplesPerOccurrence: 1,
		}),
		{ usageClass: "standard", quotaKey: "standard-daily-v1", limitUnits: 2400 },
	);
});

test("both Claude modes share one premium daily budget and reject invalid surfaces", () => {
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
	assert.deepEqual(nativePolicy, { usageClass: "premium", quotaKey: "claude-daily-v1", limitUnits: 25 });
	assert.deepEqual(basePolicy, nativePolicy);
	assert.equal(
		resolveRuntimeTrackingPolicy({
			resolved,
			assignmentSource: "premium",
			targetKey: "claude",
			cadenceMinutes: 1440,
			samplesPerOccurrence: 1,
		}),
		null,
	);
});

test("custom Claude assignments honor the contract's allowed modes", () => {
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
	assert.deepEqual(
		resolveRuntimeTrackingPolicy({
			resolved,
			assignmentSource: "custom",
			targetKey: "claude-base-model",
			cadenceMinutes: 1440,
			samplesPerOccurrence: 1,
		}),
		{ usageClass: "custom", quotaKey: "custom-claude-daily-v1", limitUnits: 10 },
	);
	assert.equal(
		resolveRuntimeTrackingPolicy({
			resolved,
			assignmentSource: "custom",
			targetKey: "claude-native-web",
			cadenceMinutes: 1440,
			samplesPerOccurrence: 1,
		}),
		null,
	);
});
