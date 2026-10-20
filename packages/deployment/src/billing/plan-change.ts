/**
 * Switching an org's plan in place. Stripe's portal refuses to update a
 * subscription with more than one item, and the premium add-on is a second
 * item, so plan changes edit the subscription through the API instead.
 *
 * The plugin's customer.subscription.updated webhook records the new plan and
 * the add-on sync in plugin.ts records the new add-on quantity; both are also
 * written here so the change shows up before the webhook lands.
 */

import { PLANS, type PlanKey, stripePlanLookupKey } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { subscription as subscriptionTable } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import {
	baseItemInterval,
	extractPremiumAddonQuantity,
	isPremiumAddonItem,
	type SubscriptionItemLike,
	savePremiumAddonQuantity,
} from "./addon";
import { getStripeClient } from "./stripe-client";

/**
 * Item edits that move a subscription onto `plan`: the base item takes the new
 * price, and add-on items are dropped when the plan doesn't sell the add-on —
 * otherwise Stripe would keep billing for pairings the plan no longer grants.
 */
export function planChangeItems(
	items: SubscriptionItemLike[],
	plan: PlanKey,
	priceId: string,
): Stripe.SubscriptionUpdateParams.Item[] {
	const base = items.find((item) => !isPremiumAddonItem(item));
	if (!base) throw new Error("Subscription has no plan item to switch");

	const edits: Stripe.SubscriptionUpdateParams.Item[] = [{ id: base.id, price: priceId }];
	if (!PLANS[plan].premiumAddonAvailable) {
		for (const item of items.filter(isPremiumAddonItem)) edits.push({ id: item.id, deleted: true });
	}
	return edits;
}

export async function changeSubscriptionPlan(input: {
	stripeSubscriptionId: string;
	organizationId: string;
	plan: PlanKey;
}): Promise<void> {
	const stripe = getStripeClient();
	const current = await stripe.subscriptions.retrieve(input.stripeSubscriptionId);
	const items = current.items.data;

	const lookupKey = stripePlanLookupKey(input.plan, baseItemInterval(items));
	const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
	const price = prices.data[0];
	if (!price) {
		throw new Error(
			`Stripe price with lookup key "${lookupKey}" not found — run packages/deployment/scripts/bootstrap-stripe.ts against this Stripe account`,
		);
	}

	const updated = await stripe.subscriptions.update(current.id, {
		items: planChangeItems(items, input.plan, price.id),
		proration_behavior: "create_prorations",
	});

	await db
		.update(subscriptionTable)
		.set({ plan: input.plan })
		.where(eq(subscriptionTable.stripeSubscriptionId, current.id));
	await savePremiumAddonQuantity(input.organizationId, extractPremiumAddonQuantity(updated.items.data));
}
