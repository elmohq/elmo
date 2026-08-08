/**
 * The extra-Claude-prompts add-on ($5/prompt/month, Pro/Business): a
 * quantity-based second item on the org's existing Stripe subscription.
 *
 * @better-auth/stripe manages the base subscription but not additional items,
 * so quantity changes call the Stripe API directly here. The webhook keeps the
 * local mirror honest: every customer.subscription.updated event re-derives
 * organization_settings.claude_addon_quantity from the subscription items, so
 * changes made anywhere (this app, the Stripe dashboard, the customer portal)
 * all converge on the same stored quantity.
 */

import { CLAUDE_ADDON_LOOKUP_KEYS, type BillingInterval } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { organizationSettings } from "@workspace/lib/db/schema";
import type Stripe from "stripe";
import { getStripeClient } from "./stripe-client";

const ADDON_LOOKUP_KEY_SET = new Set<string>(Object.values(CLAUDE_ADDON_LOOKUP_KEYS));

/** Minimal shape of a Stripe subscription item this module reads. */
export interface SubscriptionItemLike {
	id: string;
	quantity?: number | undefined;
	price: { lookup_key?: string | null; recurring?: { interval?: string | null } | null };
}

export function isClaudeAddonItem(item: SubscriptionItemLike): boolean {
	return !!item.price.lookup_key && ADDON_LOOKUP_KEY_SET.has(item.price.lookup_key);
}

/** Purchased extra-Claude-prompts quantity on a subscription's items. */
export function extractClaudeAddonQuantity(items: SubscriptionItemLike[]): number {
	return items.filter(isClaudeAddonItem).reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

/**
 * The billing interval of the subscription's base (non-add-on) item — the
 * add-on price must share it (Stripe rejects mixed-interval subscriptions).
 */
export function baseItemInterval(items: SubscriptionItemLike[]): BillingInterval {
	const base = items.find((item) => !isClaudeAddonItem(item));
	return base?.price.recurring?.interval === "year" ? "annual" : "monthly";
}

/** Store the quantity we derived from Stripe. Upsert: most orgs have no row. */
export async function saveClaudeAddonQuantity(organizationId: string, quantity: number): Promise<void> {
	await db
		.insert(organizationSettings)
		.values({ organizationId, claudeAddonQuantity: quantity })
		.onConflictDoUpdate({
			target: organizationSettings.organizationId,
			set: { claudeAddonQuantity: quantity, updatedAt: new Date() },
		});
}

/** Webhook path: mirror the subscription's add-on quantity locally. */
export async function syncClaudeAddonFromSubscription(
	organizationId: string,
	stripeSubscription: Pick<Stripe.Subscription, "items">,
): Promise<void> {
	await saveClaudeAddonQuantity(organizationId, extractClaudeAddonQuantity(stripeSubscription.items.data));
}

/**
 * Set the org's purchased extra-Claude-prompts quantity by editing the item on
 * its live Stripe subscription (prorated by Stripe). The caller is responsible
 * for authorization and for validating the org's plan allows the add-on.
 * Returns the new quantity.
 */
export async function setClaudeAddonQuantity(input: {
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
	const existing = items.find((item) => isClaudeAddonItem(item));

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
		const lookupKey = CLAUDE_ADDON_LOOKUP_KEYS[baseItemInterval(items)];
		const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
		const price = prices.data[0];
		if (!price) {
			throw new Error(
				`Stripe price with lookup key "${lookupKey}" not found — run packages/cloud/scripts/bootstrap-stripe.ts against this Stripe account`,
			);
		}
		await stripe.subscriptionItems.create({
			subscription: subscription.id,
			price: price.id,
			quantity,
			proration_behavior: "create_prorations",
		});
	}

	// The customer.subscription.updated webhook re-derives this too; writing it
	// now makes the change visible to the app immediately.
	await saveClaudeAddonQuantity(input.organizationId, quantity);
	return quantity;
}
