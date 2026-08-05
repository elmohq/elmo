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
		subscription: { planId: "pro", status: "active" },
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

test("premium budget includes purchased Claude prompt slots and rejects invalid surfaces", () => {
	const resolved = resolveEntitlements({
		mode: "cloud",
		subscription: { planId: "pro", status: "active", claudeAddonPromptSlots: 5 },
	});
	assert.equal(
		resolveRuntimeTrackingPolicy({
			resolved,
			assignmentSource: "premium",
			targetKey: "claude-native-web",
			cadenceMinutes: 1440,
			samplesPerOccurrence: 1,
		})?.limitUnits,
		25,
	);
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
