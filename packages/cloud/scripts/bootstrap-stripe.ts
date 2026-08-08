/**
 * Provision a Stripe account (test or live) with the Elmo Cloud catalog:
 * one product per plan plus the extra-Claude-prompts add-on, with monthly and
 * annual prices carrying the lookup keys the app resolves at checkout.
 *
 * Idempotent: existing lookup keys are left untouched, so re-running after
 * editing packages/config/src/plans.ts only creates what's missing. Stripe
 * prices are immutable — to change an amount, this creates a NEW price and
 * moves the lookup key to it (transfer_lookup_key), which is Stripe's intended
 * flow; existing subscriptions keep their old price until changed.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... pnpm -C packages/cloud exec tsx scripts/bootstrap-stripe.ts
 */

import {
	CLAUDE_ADDON_ANNUAL_USD,
	CLAUDE_ADDON_LOOKUP_KEYS,
	CLAUDE_ADDON_MONTHLY_USD,
	PLANS,
	PLAN_KEYS,
	stripePlanLookupKey,
	type BillingInterval,
} from "@workspace/config/plans";
import Stripe from "stripe";

interface DesiredPrice {
	lookupKey: string;
	productName: string;
	productKey: string;
	unitAmountUsd: number;
	interval: "month" | "year";
}

function desiredCatalog(): DesiredPrice[] {
	const prices: DesiredPrice[] = [];
	for (const key of PLAN_KEYS) {
		const plan = PLANS[key];
		const entries: [BillingInterval, number, "month" | "year"][] = [
			["monthly", plan.monthlyPriceUsd, "month"],
			["annual", plan.annualPriceUsd, "year"],
		];
		for (const [interval, usd, stripeInterval] of entries) {
			prices.push({
				lookupKey: stripePlanLookupKey(key, interval),
				productName: `Elmo Cloud ${plan.name}`,
				productKey: key,
				unitAmountUsd: usd,
				interval: stripeInterval,
			});
		}
	}
	prices.push({
		lookupKey: CLAUDE_ADDON_LOOKUP_KEYS.monthly,
		productName: "Elmo Cloud Extra Claude Prompts",
		productKey: "claude-addon",
		unitAmountUsd: CLAUDE_ADDON_MONTHLY_USD,
		interval: "month",
	});
	prices.push({
		lookupKey: CLAUDE_ADDON_LOOKUP_KEYS.annual,
		productName: "Elmo Cloud Extra Claude Prompts",
		productKey: "claude-addon",
		unitAmountUsd: CLAUDE_ADDON_ANNUAL_USD,
		interval: "year",
	});
	return prices;
}

async function main() {
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) {
		console.error("STRIPE_SECRET_KEY is required");
		process.exit(1);
	}
	const stripe = new Stripe(key);
	const catalog = desiredCatalog();

	const existingPrices = await stripe.prices.list({
		lookup_keys: catalog.map((p) => p.lookupKey),
		limit: 100,
	});
	const existingByLookupKey = new Map(existingPrices.data.map((p) => [p.lookup_key, p]));

	const products = await stripe.products.list({ limit: 100, active: true });
	const productByKey = new Map(
		products.data.filter((p) => p.metadata.elmo_catalog_key).map((p) => [p.metadata.elmo_catalog_key, p]),
	);

	for (const desired of catalog) {
		const existing = existingByLookupKey.get(desired.lookupKey);
		if (existing) {
			console.log(`= ${desired.lookupKey} → ${existing.id} (exists)`);
			continue;
		}

		let product = productByKey.get(desired.productKey);
		if (!product) {
			product = await stripe.products.create({
				name: desired.productName,
				metadata: { elmo_catalog_key: desired.productKey },
			});
			productByKey.set(desired.productKey, product);
			console.log(`+ product ${desired.productName} → ${product.id}`);
		}

		const price = await stripe.prices.create({
			product: product.id,
			currency: "usd",
			unit_amount: Math.round(desired.unitAmountUsd * 100),
			recurring: { interval: desired.interval },
			lookup_key: desired.lookupKey,
			transfer_lookup_key: true,
		});
		console.log(`+ ${desired.lookupKey} → ${price.id} ($${desired.unitAmountUsd}/${desired.interval})`);
	}

	console.log("\nStripe catalog is in sync with packages/config/src/plans.ts");
	console.log("Remember to configure the webhook endpoint: <APP_URL>/api/auth/stripe/webhook");
	console.log("Events: checkout.session.completed, customer.subscription.created,");
	console.log("        customer.subscription.updated, customer.subscription.deleted");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
