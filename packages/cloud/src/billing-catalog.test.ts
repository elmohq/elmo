import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
	CLOUD_STRIPE_PLANS,
	identifyCloudPrice,
	validateCloudStripePriceCatalog,
} from "./billing-catalog";
import { CLOUD_CLAUDE_PROMPT_ADDON, CLOUD_PLAN_CATALOG } from "@workspace/config/plans";

function price(lookupKey: string, unitAmount: number, interval: "month" | "year"): Stripe.Price {
	return {
		id: `price_${lookupKey}`,
		object: "price",
		active: true,
		billing_scheme: "per_unit",
		created: 0,
		currency: "usd",
		custom_unit_amount: null,
		livemode: false,
		lookup_key: lookupKey,
		metadata: {},
		nickname: null,
		product: "prod_elmo",
		recurring: { interval, interval_count: 1, meter: null, trial_period_days: null, usage_type: "licensed" },
		tax_behavior: "unspecified",
		tiers_mode: null,
		transform_quantity: null,
		type: "recurring",
		unit_amount: unitAmount,
		unit_amount_decimal: String(unitAmount),
	} as unknown as Stripe.Price;
}

function catalogPrices(): Stripe.Price[] {
	const basePrices = Object.values(CLOUD_PLAN_CATALOG).flatMap((plan) =>
		plan.billing.kind === "self-serve"
			? [
					price(plan.billing.monthly.lookupKey, plan.billing.monthly.unitAmountCents, "month"),
					price(plan.billing.annual.lookupKey, plan.billing.annual.unitAmountCents, "year"),
				]
			: [],
	);
	return [
		...basePrices,
		price(CLOUD_CLAUDE_PROMPT_ADDON.monthly.lookupKey, CLOUD_CLAUDE_PROMPT_ADDON.monthly.unitAmountCents, "month"),
		price(CLOUD_CLAUDE_PROMPT_ADDON.annual.lookupKey, CLOUD_CLAUDE_PROMPT_ADDON.annual.unitAmountCents, "year"),
	];
}

function stripeWithPrices(prices: Stripe.Price[]): Stripe {
	return { prices: { list: vi.fn().mockResolvedValue({ data: prices }) } } as unknown as Stripe;
}

describe("cloud Stripe catalog", () => {
	it("adapts all self-serve plans to Better Auth lookup keys without trials", () => {
		expect(CLOUD_STRIPE_PLANS).toHaveLength(4);
		expect(CLOUD_STRIPE_PLANS[0]).toEqual({
			name: "starter",
			lookupKey: "elmo_cloud_starter_monthly",
			annualDiscountLookupKey: "elmo_cloud_starter_annual",
			prorationBehavior: "always_invoice",
		});
		expect(CLOUD_STRIPE_PLANS.every((plan) => plan.freeTrial === undefined)).toBe(true);
	});

	it("identifies base and premium prices by stable lookup key", () => {
		expect(identifyCloudPrice("elmo_cloud_pro_annual")).toEqual({
			kind: "base_plan",
			planId: "pro",
			interval: "year",
		});
		expect(identifyCloudPrice("elmo_cloud_claude_prompt_monthly")).toEqual({
			kind: "premium_addon",
			planId: undefined,
			interval: "month",
		});
		expect(identifyCloudPrice("unknown")).toBeUndefined();
	});

	it("validates exact active Price currency, amount, and interval", async () => {
		await expect(validateCloudStripePriceCatalog(stripeWithPrices(catalogPrices()))).resolves.toBeUndefined();
	});

	it("reports every catalog mismatch in one actionable error", async () => {
		const prices = catalogPrices().filter((candidate) => candidate.lookup_key !== "elmo_cloud_basic_monthly");
		const starter = prices.find((candidate) => candidate.lookup_key === "elmo_cloud_starter_monthly")!;
		starter.unit_amount = 1;

		await expect(validateCloudStripePriceCatalog(stripeWithPrices(prices))).rejects.toThrow(
			/expected 2900 cents, found 1[\s\S]*basic_monthly: expected one active price, found 0/,
		);
	});
});
