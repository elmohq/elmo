/**
 * Only cloud constructs this, so no Stripe routes exist in other modes. The
 * webhook is the single writer of subscription status.
 *
 * subscription.enabled and organization.enabled are mirrored in
 * packages/lib/scripts/generate-auth-schema.sh; keep them in sync.
 */

import { stripe } from "@better-auth/stripe";
import { PLAN_KEYS, stripePlanLookupKey } from "@workspace/config/plans";
import { isOrgAdminRole } from "@workspace/config/roles";
import { db } from "@workspace/lib/db/db";
import { member } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { savePremiumAddonQuantity, syncPremiumAddonFromSubscription } from "./addon";
import { dunningNoticeForStatusChange, sendDunningNotice } from "./dunning";
import { getStripeClient } from "./stripe-client";

/** Priced by lookup key, so one build runs against any bootstrapped Stripe account. */
export function buildStripePlans() {
	return PLAN_KEYS.map((key) => ({
		name: key,
		lookupKey: stripePlanLookupKey(key, "monthly"),
		annualDiscountLookupKey: stripePlanLookupKey(key, "annual"),
	}));
}

/** Managing the org's subscription (upgrade, cancel, restore, portal) is an org-admin action. */
export async function isOrgBillingAdmin(userId: string, organizationId: string): Promise<boolean> {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
		.limit(1);
	return isOrgAdminRole(row?.role);
}

/**
 * Puts the promotion code field on Stripe Checkout; the codes live in the Stripe
 * dashboard. Only first checkout uses a Session, so an existing subscriber's
 * discount is applied to their subscription in Stripe instead. Stripe rejects
 * this alongside a pre-applied `discounts`, so it must stay the only discount here.
 */
const CHECKOUT_SESSION_PARAMS = { allow_promotion_codes: true } as const;

export function createStripeBillingPlugin() {
	return stripe({
		stripeClient: getStripeClient(),
		stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
		// Billing is per org, so the customer is created at the org's first checkout.
		createCustomerOnSignUp: false,
		organization: { enabled: true },
		subscription: {
			enabled: true,
			plans: buildStripePlans,
			requireEmailVerification: true,
			authorizeReference: async ({ user, referenceId }) => isOrgBillingAdmin(user.id, referenceId),
			getCheckoutSessionParams: () => ({ params: CHECKOUT_SESSION_PARAMS }),
			// Add-on changes from the app, the customer portal or the Stripe dashboard
			// all arrive here, so this is where they reach organization_settings.
			onSubscriptionUpdate: async ({ event, subscription, stripeSubscription }) => {
				await syncPremiumAddonFromSubscription(subscription.referenceId, stripeSubscription);
				if (event.type === "customer.subscription.updated") {
					const notice = dunningNoticeForStatusChange(
						event.data.previous_attributes?.status,
						stripeSubscription.status,
					);
					if (notice) await sendDunningNotice(subscription.referenceId, notice);
				}
			},
			onSubscriptionDeleted: async ({ subscription }) => {
				await savePremiumAddonQuantity(subscription.referenceId, 0);
				await sendDunningNotice(subscription.referenceId, "subscription-ended");
			},
		},
	});
}
