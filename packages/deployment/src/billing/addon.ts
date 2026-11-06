/**
 * The premium slots add-on is a second item on the org's subscription, which
 * @better-auth/stripe doesn't manage, so this calls Stripe directly. Every
 * subscription webhook re-derives the stored quantity from the items, so
 * changes made anywhere converge.
 */

import { type BillingInterval, PREMIUM_ADDON_LOOKUP_KEYS } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { organizationSettings } from "@workspace/lib/db/schema";
import type Stripe from "stripe";
import { getStripeClient } from "./stripe-client";

const ADDON_LOOKUP_KEY_SET = new Set<string>(Object.values(PREMIUM_ADDON_LOOKUP_KEYS));

export interface SubscriptionItemLike {
	id: string;
	quantity?: number | undefined;
	price: { lookup_key?: string | null; recurring?: { interval?: string | null } | null };
}

export function isPremiumAddonItem(item: SubscriptionItemLike): boolean {
	return !!item.price.lookup_key && ADDON_LOOKUP_KEY_SET.has(item.price.lookup_key);
}

export function extractPremiumAddonQuantity(items: SubscriptionItemLike[]): number {
	return items.filter(isPremiumAddonItem).reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

/** The add-on must share the base item's interval: Stripe rejects mixed-interval subscriptions. */
export function baseItemInterval(items: SubscriptionItemLike[]): BillingInterval {
	const base = items.find((item) => !isPremiumAddonItem(item));
	return base?.price.recurring?.interval === "year" ? "annual" : "monthly";
}

/** Upserts, because most orgs have no settings row. */
export async function savePremiumAddonQuantity(organizationId: string, quantity: number): Promise<void> {
	await db
		.insert(organizationSettings)
		.values({ organizationId, premiumAddonQuantity: quantity })
		.onConflictDoUpdate({
			target: organizationSettings.organizationId,
			set: { premiumAddonQuantity: quantity, updatedAt: new Date() },
		});
}

export async function syncPremiumAddonFromSubscription(
	organizationId: string,
	stripeSubscription: Pick<Stripe.Subscription, "items">,
): Promise<void> {
	await savePremiumAddonQuantity(organizationId, extractPremiumAddonQuantity(stripeSubscription.items.data));
}

/** The caller checks authorization and that the org's plan sells the add-on. */
export async function setPremiumAddonQuantity(input: {
	stripeSubscriptionId: string;
	organizationId: string;
	quantity: number;
}): Promise<number> {
	const quantity = Math.floor(input.quantity);
	if (quantity < 0 || !Number.isFinite(quantity)) {
		throw new Error("Add-on quantity must be a non-negative integer");
	}

	const stripe = getStripeClient();
	const subscription = await stripe.subscriptions.retrieve(input.stripeSubscriptionId);
	const items = subscription.items.data;
	const existing = items.find((item) => isPremiumAddonItem(item));

	if (quantity === 0) {
		if (existing) {
			await stripe.subscriptionItems.del(existing.id, { proration_behavior: "create_prorations" });
		}
	} else if (existing) {
		if ((existing.quantity ?? 0) !== quantity) {
			await stripe.subscriptionItems.update(existing.id, {
				quantity,
				proration_behavior: "create_prorations",
			});
		}
	} else {
		const lookupKey = PREMIUM_ADDON_LOOKUP_KEYS[baseItemInterval(items)];
		const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
		const price = prices.data[0];
		if (!price) {
			throw new Error(
				`Stripe price with lookup key "${lookupKey}" not found — run packages/deployment/scripts/bootstrap-stripe.ts against this Stripe account`,
			);
		}
		await stripe.subscriptionItems.create({
			subscription: subscription.id,
			price: price.id,
			quantity,
			proration_behavior: "create_prorations",
		});
	}

	// The webhook writes this too; writing it now shows the change immediately.
	await savePremiumAddonQuantity(input.organizationId, quantity);
	return quantity;
}
