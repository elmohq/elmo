/**
 * The @better-auth/stripe server plugin, configured for org-scoped
 * subscriptions on the Elmo Cloud plan catalog.
 *
 * Injected into the shared auth factory via CreateAuthOptions.extraPlugins in
 * cloud mode only — no other deployment mode constructs it, so no Stripe
 * routes or behavior exist outside cloud. The webhook
 * (POST /api/auth/stripe/webhook) is the single writer of subscription status;
 * web and worker read the resulting rows through getOrgBillingState.
 *
 * Schema note: the schema-relevant options here (subscription.enabled,
 * organization.enabled) are mirrored in the schema-generation helper in
 * packages/lib/scripts/generate-auth-schema.sh — keep them in sync.
 */

import { stripe } from "@better-auth/stripe";
import { PLAN_KEYS, stripePlanLookupKey } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { member } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { saveClaudeAddonQuantity, syncClaudeAddonFromSubscription } from "./addon";
import { dunningNoticeForStatusChange, sendDunningNotice } from "./dunning";
import { getStripeClient } from "./stripe-client";

/**
 * Plans handed to the plugin: named by plan key, priced by lookup key so the
 * same build runs against any bootstrapped Stripe account (test or live).
 */
export function buildStripePlans() {
	return PLAN_KEYS.map((key) => ({
		name: key,
		lookupKey: stripePlanLookupKey(key, "monthly"),
		annualDiscountLookupKey: stripePlanLookupKey(key, "annual"),
	}));
}

/**
 * Managing the org's subscription (upgrade, cancel, restore, portal) is an
 * org-admin action. Our provisioning writes role "admin"; better-auth's own
 * org creation would write "owner" — accept either, deny plain members.
 */
export async function isOrgBillingAdmin(userId: string, organizationId: string): Promise<boolean> {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
		.limit(1);
	return row?.role === "admin" || row?.role === "owner";
}

export function createStripeBillingPlugin() {
	return stripe({
		stripeClient: getStripeClient(),
		stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
		// Customers are created lazily for the org at first checkout; user-level
		// customers are never needed (billing is org-scoped).
		createCustomerOnSignUp: false,
		organization: { enabled: true },
		subscription: {
			enabled: true,
			plans: buildStripePlans,
			requireEmailVerification: true,
			authorizeReference: async ({ user, referenceId }) => isOrgBillingAdmin(user.id, referenceId),
			// Fires on every subscription webhook update — the point where
			// add-on quantity changes (from this app, the customer portal, or
			// the Stripe dashboard) converge into organization_settings, and
			// where status transitions surface for dunning email.
			onSubscriptionUpdate: async ({ event, subscription, stripeSubscription }) => {
				await syncClaudeAddonFromSubscription(subscription.referenceId, stripeSubscription);
				if (event.type === "customer.subscription.updated") {
					const notice = dunningNoticeForStatusChange(
						event.data.previous_attributes?.status,
						stripeSubscription.status,
					);
					if (notice) await sendDunningNotice(subscription.referenceId, notice);
				}
			},
			onSubscriptionDeleted: async ({ subscription }) => {
				await saveClaudeAddonQuantity(subscription.referenceId, 0);
				await sendDunningNotice(subscription.referenceId, "subscription-ended");
			},
		},
	});
}
