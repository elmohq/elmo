import { describe, expect, it } from "vitest";
import {
	NO_PLAN_ENTITLEMENTS,
	UNLIMITED_ENTITLEMENTS,
	deriveSubscriptionStanding,
	parseEntitlementOverrides,
	resolveEntitlements,
	type ResolveEntitlementsInput,
	type SubscriptionSnapshot,
} from "./entitlements";
import { MAX_STANDARD_RUNS_PER_DAY, PLANS } from "./plans";
import type { DeploymentMode } from "./types";

const NOW = new Date("2026-08-05T12:00:00Z");

function activeSubscription(plan: string): SubscriptionSnapshot {
	return { status: "active", plan, periodEnd: new Date("2026-09-01T00:00:00Z") };
}

function resolve(overrides: Partial<ResolveEntitlementsInput> = {}) {
	return resolveEntitlements({
		mode: "cloud",
		subscription: activeSubscription("pro"),
		claudeAddonQuantity: 0,
		overrides: null,
		now: NOW,
		...overrides,
	});
}

describe("resolveEntitlements: deployment modes", () => {
	it.each<DeploymentMode>(["local", "demo", "whitelabel"])("%s resolves to unlimited", (mode) => {
		const result = resolveEntitlements({
			mode,
			subscription: null,
			claudeAddonQuantity: 0,
			overrides: null,
			now: NOW,
		});
		expect(result).toEqual(UNLIMITED_ENTITLEMENTS);
		expect(result.unlimited).toBe(true);
		expect(result.trackingActive).toBe(true);
	});

	it("non-cloud modes ignore subscription state and overrides entirely", () => {
		const result = resolveEntitlements({
			mode: "whitelabel",
			subscription: { status: "canceled", plan: "pro", periodEnd: null },
			claudeAddonQuantity: 99,
			overrides: { maxBrands: 1 },
			now: NOW,
		});
		expect(result).toEqual(UNLIMITED_ENTITLEMENTS);
	});
});

describe("resolveEntitlements: cloud plans", () => {
	it("maps each plan definition through unchanged", () => {
		for (const plan of Object.values(PLANS)) {
			const result = resolve({ subscription: activeSubscription(plan.key) });
			expect(result.unlimited).toBe(false);
			expect(result.planKey).toBe(plan.key);
			expect(result.trackingActive).toBe(true);
			expect(result.maxBrands).toBe(plan.maxBrands);
			expect(result.maxPrompts).toBe(plan.maxPrompts);
			expect(result.platformMenu).toEqual([...plan.platformMenu]);
			expect(result.platformPicks).toBe(plan.platformPicks);
			expect(result.standardRunsPerDay).toBe(plan.standardRunsPerDay);
			expect(result.replication).toBe(1);
			expect(result.claudePool).toBe(plan.claudeIncluded);
		}
	});

	it("no subscription resolves to the paywall state", () => {
		const result = resolve({ subscription: null });
		expect(result).toEqual(NO_PLAN_ENTITLEMENTS);
		expect(result.trackingActive).toBe(false);
		expect(result.maxBrands).toBe(0);
	});

	it("an unknown plan name resolves to the paywall state", () => {
		expect(resolve({ subscription: activeSubscription("enterprise-legacy") })).toEqual(NO_PLAN_ENTITLEMENTS);
	});

	it("starter is chatgpt-only with one pick at 1×/day", () => {
		const result = resolve({ subscription: activeSubscription("starter") });
		expect(result.platformMenu).toEqual(["chatgpt"]);
		expect(result.platformPicks).toBe(1);
		expect(result.standardRunsPerDay).toBe(1);
		expect(result.claudePool).toBe(0);
	});
});

describe("resolveEntitlements: claude add-on", () => {
	it("adds purchased quantity to the included pool on pro/business", () => {
		expect(resolve({ subscription: activeSubscription("pro"), claudeAddonQuantity: 7 }).claudePool).toBe(27);
		expect(resolve({ subscription: activeSubscription("business"), claudeAddonQuantity: 3 }).claudePool).toBe(33);
	});

	it("ignores add-on quantity on plans without the add-on", () => {
		expect(resolve({ subscription: activeSubscription("basic"), claudeAddonQuantity: 5 }).claudePool).toBe(0);
		expect(resolve({ subscription: activeSubscription("starter"), claudeAddonQuantity: 5 }).claudePool).toBe(0);
	});

	it("clamps negative or fractional quantities", () => {
		expect(resolve({ claudeAddonQuantity: -4 }).claudePool).toBe(PLANS.pro.claudeIncluded);
		expect(resolve({ claudeAddonQuantity: 2.9 }).claudePool).toBe(PLANS.pro.claudeIncluded + 2);
	});
});

describe("resolveEntitlements: standing", () => {
	it("past_due within grace keeps tracking active", () => {
		const result = resolve({
			subscription: { status: "past_due", plan: "pro", periodEnd: new Date("2026-08-01T00:00:00Z") },
		});
		expect(result.standing).toBe("grace");
		expect(result.trackingActive).toBe(true);
		expect(result.maxPrompts).toBe(PLANS.pro.maxPrompts);
	});

	it("past_due beyond grace pauses tracking but keeps plan limits visible", () => {
		const result = resolve({
			subscription: { status: "past_due", plan: "pro", periodEnd: new Date("2026-07-01T00:00:00Z") },
		});
		expect(result.standing).toBe("paused");
		expect(result.trackingActive).toBe(false);
		expect(result.maxPrompts).toBe(PLANS.pro.maxPrompts);
	});

	it("a canceled subscription is the paywall state", () => {
		const result = resolve({
			subscription: { status: "canceled", plan: "pro", periodEnd: new Date("2026-07-01T00:00:00Z") },
		});
		expect(result).toEqual(NO_PLAN_ENTITLEMENTS);
	});
});

describe("deriveSubscriptionStanding", () => {
	const periodEnd = new Date("2026-08-01T00:00:00Z");

	it.each([
		["active", "active"],
		["trialing", "active"],
		["canceled", "none"],
		["incomplete", "none"],
		["unpaid", "none"],
	])("status %s → %s", (status, expected) => {
		expect(deriveSubscriptionStanding({ status, plan: "pro", periodEnd }, NOW)).toBe(expected);
	});

	it("past_due is grace until exactly 7 days after period end, then paused", () => {
		const sub: SubscriptionSnapshot = { status: "past_due", plan: "pro", periodEnd };
		expect(deriveSubscriptionStanding(sub, new Date("2026-08-08T00:00:00Z"))).toBe("grace");
		expect(deriveSubscriptionStanding(sub, new Date("2026-08-08T00:00:01Z"))).toBe("paused");
	});

	it("past_due with no period end stays in grace (never silently pauses)", () => {
		expect(deriveSubscriptionStanding({ status: "past_due", plan: "pro", periodEnd: null }, NOW)).toBe("grace");
	});

	it("no subscription → none", () => {
		expect(deriveSubscriptionStanding(null, NOW)).toBe("none");
	});
});

describe("resolveEntitlements: custom plan overrides", () => {
	it("sparse overrides replace only the fields they set", () => {
		const result = resolve({
			subscription: activeSubscription("business"),
			overrides: { maxPrompts: 1000, standardRunsPerDay: 7 },
		});
		expect(result.planKey).toBe("business");
		expect(result.maxPrompts).toBe(1000);
		expect(result.standardRunsPerDay).toBe(7);
		expect(result.maxBrands).toBe(PLANS.business.maxBrands);
		expect(result.claudePool).toBe(PLANS.business.claudeIncluded);
	});

	it("extraPlatforms extend the menu without duplicates", () => {
		const result = resolve({
			subscription: activeSubscription("business"),
			overrides: { extraPlatforms: ["gpt-5-search", "chatgpt"], platformPicks: 5 },
		});
		expect(result.platformMenu).toContain("gpt-5-search");
		expect(result.platformMenu?.filter((m) => m === "chatgpt")).toHaveLength(1);
		expect(result.platformPicks).toBe(5);
	});

	it("planOverride custom is entitled without any subscription, based on business", () => {
		const result = resolve({
			subscription: null,
			overrides: { planOverride: "custom", maxBrands: 20, claudePoolIncluded: 100 },
			claudeAddonQuantity: 5,
		});
		expect(result.planKey).toBe("custom");
		expect(result.standing).toBe("active");
		expect(result.trackingActive).toBe(true);
		expect(result.maxBrands).toBe(20);
		expect(result.maxPrompts).toBe(PLANS.business.maxPrompts);
		expect(result.claudePool).toBe(105);
	});

	it("planOverride custom ignores a dead subscription's standing", () => {
		const result = resolve({
			subscription: { status: "canceled", plan: "pro", periodEnd: null },
			overrides: { planOverride: "custom" },
		});
		expect(result.standing).toBe("active");
		expect(result.planKey).toBe("custom");
		expect(result.maxPrompts).toBe(PLANS.business.maxPrompts);
	});

	it("sampling overrides clamp to the research ceiling", () => {
		const result = resolve({
			subscription: activeSubscription("business"),
			// Schema rejects >7; simulate a stale stored value sneaking past it.
			overrides: { standardRunsPerDay: MAX_STANDARD_RUNS_PER_DAY },
		});
		expect(result.standardRunsPerDay).toBe(MAX_STANDARD_RUNS_PER_DAY);
	});
});

describe("parseEntitlementOverrides", () => {
	it("accepts a valid sparse payload", () => {
		expect(parseEntitlementOverrides({ maxBrands: 3 })).toEqual({ maxBrands: 3 });
	});

	it("returns null for null/undefined", () => {
		expect(parseEntitlementOverrides(null)).toBeNull();
		expect(parseEntitlementOverrides(undefined)).toBeNull();
	});

	it("rejects unknown keys and malformed values (fails toward plan limits, not unlimited)", () => {
		expect(parseEntitlementOverrides({ maxBrands: "lots" })).toBeNull();
		expect(parseEntitlementOverrides({ unlimitedEverything: true })).toBeNull();
		expect(parseEntitlementOverrides({ standardRunsPerDay: 24 })).toBeNull();
	});
});
