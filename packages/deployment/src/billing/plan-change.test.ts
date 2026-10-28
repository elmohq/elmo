import { PREMIUM_ADDON_LOOKUP_KEYS, stripePlanLookupKey } from "@workspace/config/plans";
import { describe, expect, it } from "vitest";
import type { SubscriptionItemLike } from "./addon";
import { planChangeItems } from "./plan-change";

function item(id: string, lookupKey: string, quantity = 1): SubscriptionItemLike {
	return { id, quantity, price: { lookup_key: lookupKey, recurring: { interval: "month" } } };
}

const proWithAddon = [
	item("si_plan", stripePlanLookupKey("pro", "monthly")),
	item("si_addon", PREMIUM_ADDON_LOOKUP_KEYS.monthly, 5),
];

describe("planChangeItems", () => {
	it("keeps the add-on when the new plan sells it", () => {
		expect(planChangeItems(proWithAddon, "business", "price_business")).toEqual([
			{ id: "si_plan", price: "price_business" },
		]);
	});

	it("drops the add-on when the new plan doesn't sell it", () => {
		expect(planChangeItems(proWithAddon, "basic", "price_basic")).toEqual([
			{ id: "si_plan", price: "price_basic" },
			{ id: "si_addon", deleted: true },
		]);
	});

	it("switches the plan item even when the add-on is listed first", () => {
		const [plan, addon] = proWithAddon;
		expect(planChangeItems([addon, plan], "business", "price_business")).toEqual([
			{ id: "si_plan", price: "price_business" },
		]);
	});

	it("refuses a subscription with no plan item", () => {
		expect(() => planChangeItems([proWithAddon[1]], "business", "price_business")).toThrow();
	});
});
