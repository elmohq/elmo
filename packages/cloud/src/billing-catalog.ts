import type { StripePlan } from "@better-auth/stripe";
import {
	CLOUD_CLAUDE_PROMPT_ADDON,
	CLOUD_PLAN_CATALOG,
	SELF_SERVE_CLOUD_PLAN_IDS,
	type SelfServeCloudPlanId,
} from "@workspace/config/plans";
import type Stripe from "stripe";

export type BillingInterval = "month" | "year";

export interface CloudPriceIdentity {
	kind: "base_plan" | "premium_addon";
	planId?: SelfServeCloudPlanId;
	interval: BillingInterval;
}

interface PriceExpectation extends CloudPriceIdentity {
	lookupKey: string;
	currency: "usd";
	unitAmountCents: number;
}

export const CLOUD_STRIPE_PLANS: StripePlan[] = SELF_SERVE_CLOUD_PLAN_IDS.map((planId) => {
	const plan = CLOUD_PLAN_CATALOG[planId];
	if (plan.billing.kind !== "self-serve") throw new Error(`Cloud plan ${planId} is not self-serve`);
	return {
		name: plan.id,
		lookupKey: plan.billing.monthly.lookupKey,
		annualDiscountLookupKey: plan.billing.annual.lookupKey,
		prorationBehavior: "always_invoice",
	};
});

const PRICE_EXPECTATIONS: PriceExpectation[] = [
	...SELF_SERVE_CLOUD_PLAN_IDS.flatMap((planId): PriceExpectation[] => {
		const plan = CLOUD_PLAN_CATALOG[planId];
		if (plan.billing.kind !== "self-serve") throw new Error(`Cloud plan ${planId} is not self-serve`);
		return [
			{
				kind: "base_plan",
				planId,
				interval: "month",
				lookupKey: plan.billing.monthly.lookupKey,
				currency: plan.billing.currency,
				unitAmountCents: plan.billing.monthly.unitAmountCents,
			},
			{
				kind: "base_plan",
				planId,
				interval: "year",
				lookupKey: plan.billing.annual.lookupKey,
				currency: plan.billing.currency,
				unitAmountCents: plan.billing.annual.unitAmountCents,
			},
		];
	}),
	{
		kind: "premium_addon",
		interval: "month",
		lookupKey: CLOUD_CLAUDE_PROMPT_ADDON.monthly.lookupKey,
		currency: CLOUD_CLAUDE_PROMPT_ADDON.currency,
		unitAmountCents: CLOUD_CLAUDE_PROMPT_ADDON.monthly.unitAmountCents,
	},
	{
		kind: "premium_addon",
		interval: "year",
		lookupKey: CLOUD_CLAUDE_PROMPT_ADDON.annual.lookupKey,
		currency: CLOUD_CLAUDE_PROMPT_ADDON.currency,
		unitAmountCents: CLOUD_CLAUDE_PROMPT_ADDON.annual.unitAmountCents,
	},
];

const PRICE_IDENTITY_BY_LOOKUP_KEY = new Map(
	PRICE_EXPECTATIONS.map(({ lookupKey, kind, planId, interval }) => [lookupKey, { kind, planId, interval }]),
);

export function identifyCloudPrice(lookupKey: string | null | undefined): CloudPriceIdentity | undefined {
	return lookupKey ? PRICE_IDENTITY_BY_LOOKUP_KEY.get(lookupKey) : undefined;
}

/**
 * Fail startup/release validation when Stripe's immutable Price objects drift
 * from the catalog compiled into the application.
 */
export async function validateCloudStripePriceCatalog(stripeClient: Stripe): Promise<void> {
	const lookupKeys = PRICE_EXPECTATIONS.map((expectation) => expectation.lookupKey);
	const result = await stripeClient.prices.list({ active: true, lookup_keys: lookupKeys, limit: 100 });
	const byLookupKey = new Map<string, Stripe.Price[]>();
	for (const price of result.data) {
		if (!price.lookup_key) continue;
		const prices = byLookupKey.get(price.lookup_key) ?? [];
		prices.push(price);
		byLookupKey.set(price.lookup_key, prices);
	}

	const errors: string[] = [];
	for (const expectation of PRICE_EXPECTATIONS) {
		const matches = byLookupKey.get(expectation.lookupKey) ?? [];
		if (matches.length !== 1) {
			errors.push(`${expectation.lookupKey}: expected one active price, found ${matches.length}`);
			continue;
		}
		const price = matches[0]!;
		if (price.currency !== expectation.currency) {
			errors.push(`${expectation.lookupKey}: expected ${expectation.currency}, found ${price.currency}`);
		}
		if (price.unit_amount !== expectation.unitAmountCents) {
			errors.push(
				`${expectation.lookupKey}: expected ${expectation.unitAmountCents} cents, found ${price.unit_amount ?? "null"}`,
			);
		}
		if (price.recurring?.interval !== expectation.interval || price.recurring.interval_count !== 1) {
			errors.push(
				`${expectation.lookupKey}: expected every 1 ${expectation.interval}, found ${price.recurring?.interval_count ?? "none"} ${price.recurring?.interval ?? "non-recurring"}`,
			);
		}
	}

	if (errors.length > 0) throw new Error(`Stripe price catalog validation failed:\n- ${errors.join("\n- ")}`);
}
