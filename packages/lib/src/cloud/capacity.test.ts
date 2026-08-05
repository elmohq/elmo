import { resolveEntitlements } from "@workspace/config/entitlements";
import { describe, expect, it } from "vitest";
import {
	assertCapacity,
	assertCapacityChange,
	CapacityExceededError,
	EntitlementAccessError,
	getCapacityLimit,
} from "./capacity";

describe("organization capacity", () => {
	it.each(["local", "demo", "whitelabel"] as const)("keeps %s capacity unlimited", (mode) => {
		const resolved = resolveEntitlements({ mode });
		expect(getCapacityLimit(resolved, "brands")).toBeNull();
		expect(() => assertCapacity({ resolved, resource: "prompts", requestedTotal: 1_000_000 })).not.toThrow();
	});

	it("enforces catalog limits at the requested final total", () => {
		const resolved = resolveEntitlements({
			mode: "cloud",
			subscription: {
				planId: "starter",
				status: "active",
				currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
				delinquentSince: null,
			},
		});
		expect(() => assertCapacity({ resolved, resource: "brands", requestedTotal: 1 })).not.toThrow();
		expect(() => assertCapacity({ resolved, resource: "brands", requestedTotal: 2 })).toThrow(
			new CapacityExceededError("brands", 1),
		);
		expect(() => assertCapacity({ resolved, resource: "prompts", requestedTotal: 51 })).toThrow(
			new CapacityExceededError("prompts", 50),
		);
	});

	it("fails closed before exposing a limit for an inactive subscription", () => {
		const resolved = resolveEntitlements({
			mode: "cloud",
			subscription: { planId: "pro", status: "past_due", currentPeriodEnd: null, delinquentSince: null },
		});
		expect(() => getCapacityLimit(resolved, "prompts")).toThrow(EntitlementAccessError);
	});

	it("allows an over-limit workspace to hold or reduce usage but never increase it", () => {
		const resolved = resolveEntitlements({
			mode: "cloud",
			subscription: {
				planId: "starter",
				status: "active",
				currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
				delinquentSince: null,
			},
		});
		expect(() =>
			assertCapacityChange({ resolved, resource: "prompts", currentTotal: 75, requestedTotal: 74 }),
		).not.toThrow();
		expect(() =>
			assertCapacityChange({ resolved, resource: "prompts", currentTotal: 75, requestedTotal: 75 }),
		).not.toThrow();
		expect(() => assertCapacityChange({ resolved, resource: "prompts", currentTotal: 75, requestedTotal: 76 })).toThrow(
			new CapacityExceededError("prompts", 50),
		);
	});

	it("applies the same safe downgrade rule when a disabled brand is re-enabled", () => {
		const resolved = resolveEntitlements({
			mode: "cloud",
			subscription: {
				planId: "starter",
				status: "active",
				currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
				delinquentSince: null,
			},
		});
		expect(() =>
			assertCapacityChange({ resolved, resource: "brands", currentTotal: 2, requestedTotal: 1 }),
		).not.toThrow();
		expect(() => assertCapacityChange({ resolved, resource: "brands", currentTotal: 2, requestedTotal: 3 })).toThrow(
			new CapacityExceededError("brands", 1),
		);
	});
});
