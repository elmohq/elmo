import { CLAUDE_ADDON_LOOKUP_KEYS, PLAN_KEYS, type PLANS, stripePlanLookupKey } from "@workspace/config/plans";
import { describe, expect, it } from "vitest";
import { baseItemInterval, extractClaudeAddonQuantity, isClaudeAddonItem, type SubscriptionItemLike } from "./addon";
import { buildStripePlans } from "./plugin";

function item(lookupKey: string | null, quantity: number, interval: "month" | "year" = "month"): SubscriptionItemLike {
	return { id: `si_${lookupKey ?? "base"}`, quantity, price: { lookup_key: lookupKey, recurring: { interval } } };
}

describe("extractClaudeAddonQuantity", () => {
	it("reads the monthly add-on item quantity", () => {
		const items = [item(stripePlanLookupKey("pro", "monthly"), 1), item(CLAUDE_ADDON_LOOKUP_KEYS.monthly, 12)];
		expect(extractClaudeAddonQuantity(items)).toBe(12);
	});

	it("reads the annual add-on item", () => {
		const items = [
			item(stripePlanLookupKey("business", "annual"), 1, "year"),
			item(CLAUDE_ADDON_LOOKUP_KEYS.annual, 5, "year"),
		];
		expect(extractClaudeAddonQuantity(items)).toBe(5);
	});

	it("is 0 with no add-on item, missing lookup keys, or empty items", () => {
		expect(extractClaudeAddonQuantity([item(stripePlanLookupKey("pro", "monthly"), 1)])).toBe(0);
		expect(extractClaudeAddonQuantity([item(null, 3)])).toBe(0);
		expect(extractClaudeAddonQuantity([])).toBe(0);
	});

	it("treats an add-on item with undefined quantity as 0", () => {
		const addon = { id: "si_x", price: { lookup_key: CLAUDE_ADDON_LOOKUP_KEYS.monthly } };
		expect(extractClaudeAddonQuantity([addon])).toBe(0);
	});
});

describe("baseItemInterval", () => {
	it("derives monthly and annual from the base (non-add-on) item", () => {
		expect(baseItemInterval([item(stripePlanLookupKey("pro", "monthly"), 1, "month")])).toBe("monthly");
		expect(baseItemInterval([item(stripePlanLookupKey("pro", "annual"), 1, "year")])).toBe("annual");
	});

	it("ignores the add-on item when finding the base", () => {
		const items = [
			item(CLAUDE_ADDON_LOOKUP_KEYS.annual, 4, "year"),
			item(stripePlanLookupKey("pro", "annual"), 1, "year"),
		];
		expect(baseItemInterval(items)).toBe("annual");
		expect(isClaudeAddonItem(items[0])).toBe(true);
	});
});

describe("buildStripePlans", () => {
	it("declares every plan by key with monthly + annual lookup keys", () => {
		const plans = buildStripePlans();
		expect(plans.map((p) => p.name)).toEqual(PLAN_KEYS);
		for (const plan of plans) {
			expect(plan.lookupKey).toBe(stripePlanLookupKey(plan.name as keyof typeof PLANS, "monthly"));
			expect(plan.annualDiscountLookupKey).toBe(stripePlanLookupKey(plan.name as keyof typeof PLANS, "annual"));
		}
	});
});
