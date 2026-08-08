/**
 * Pre-launch billing lifecycle verification against a REAL Stripe test-mode
 * account with test clocks: subscribe → plan upgrade → add-on quantity change
 * → payment failure → recovery → cancel, asserting after each webhook that the
 * local database (subscription + organization_settings) converged to the
 * expected state.
 *
 * Reads subscription state through the production reader (getOrgBillingState /
 * selectRelevantSubscription), so the verification asserts the same logic the
 * app uses — including status-ranked selection for cancel→resubscribe.
 *
 * Prerequisites (run all three in parallel):
 *   1. The web app running in cloud mode against your database
 *   2. stripe listen --forward-to localhost:3000/api/auth/stripe/webhook
 *      (put its whsec_... into STRIPE_WEBHOOK_SECRET of the app)
 *   3. This script:
 *      STRIPE_SECRET_KEY=sk_test_... DATABASE_URL=postgres://... \
 *        pnpm -C packages/cloud exec tsx scripts/verify-stripe-lifecycle.ts <org-id>
 *
 * <org-id> must be an existing organization row (sign up once in the app).
 * The catalog must be bootstrapped first (scripts/bootstrap-stripe.ts).
 */

import { resolveEntitlements } from "@workspace/config/entitlements";
import { CLAUDE_ADDON_LOOKUP_KEYS, PLANS, stripePlanLookupKey } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { organizationSettings } from "@workspace/lib/db/schema";
import { getOrgBillingState } from "@workspace/lib/entitlements";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

const orgId = process.argv[2];
if (!orgId || !process.env.STRIPE_SECRET_KEY || !process.env.DATABASE_URL) {
	console.error("Usage: STRIPE_SECRET_KEY=sk_test_... DATABASE_URL=... tsx verify-stripe-lifecycle.ts <org-id>");
	process.exit(2);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function priceByLookupKey(lookupKey: string): Promise<string> {
	const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
	if (!prices.data[0]) throw new Error(`Missing price ${lookupKey} — run bootstrap-stripe.ts first`);
	return prices.data[0].id;
}

async function waitForDb<T>(label: string, fn: () => Promise<T | null>): Promise<T> {
	for (let i = 0; i < 60; i++) {
		const value = await fn();
		if (value !== null) {
			console.log(`✓ ${label}`);
			return value;
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	throw new Error(`Timeout: ${label} (is stripe listen forwarding to the app?)`);
}

async function subscriptionState(): Promise<{ status: string; plan: string } | null> {
	const state = await getOrgBillingState(orgId, { mode: "cloud" });
	if (!state.subscription) return null;
	return { status: state.subscription.status ?? "", plan: state.subscription.plan };
}

async function expectStatus(label: string, expected: string): Promise<void> {
	await waitForDb(`${label} (status=${expected})`, async () => {
		const state = await subscriptionState();
		return state?.status === expected ? state : null;
	});
}

async function expectPlanAndStatus(
	label: string,
	expectedPlan: string,
	expectedStatus: string,
): Promise<{ status: string; plan: string }> {
	return waitForDb(`${label} (plan=${expectedPlan}, status=${expectedStatus})`, async () => {
		const state = await subscriptionState();
		return state?.plan === expectedPlan && state.status === expectedStatus ? state : null;
	});
}

// --- 1. Test-clock customer wired to the org --------------------------------
const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000) });
const customer = await stripe.customers.create({
	email: `lifecycle+${Date.now()}@example.com`,
	test_clock: clock.id,
	payment_method: "pm_card_visa",
	invoice_settings: { default_payment_method: "pm_card_visa" },
});
await db.execute(
	`UPDATE organization SET stripe_customer_id = $1 WHERE id = $2`,
	[customer.id, orgId] as any,
);
console.log(`✓ test-clock customer ${customer.id} attached to org ${orgId}`);

// --- 2. Subscribe (basic monthly) -------------------------------------------
const basicPrice = await priceByLookupKey(stripePlanLookupKey("basic", "monthly"));
const subscription = await stripe.subscriptions.create({
	customer: customer.id,
	items: [{ price: basicPrice }],
});
await expectPlanAndStatus("subscribe: webhook recorded the subscription", "basic", "active");

// --- 3. Plan upgrade (basic → pro) ------------------------------------------
const proPrice = await priceByLookupKey(stripePlanLookupKey("pro", "monthly"));
await stripe.subscriptions.update(subscription.id, {
	items: [{ id: subscription.items.data[0].id, price: proPrice }],
	proration_behavior: "create_prorations",
});
const upgraded = await expectPlanAndStatus("upgrade: subscription row moved to the new plan", "pro", "active");
const entitlements = resolveEntitlements({
	mode: "cloud",
	subscription: { status: upgraded.status, plan: upgraded.plan, periodEnd: null },
	claudeAddonQuantity: 0,
	overrides: null,
	now: new Date(),
});
if (entitlements.maxPrompts !== PLANS.pro.maxPrompts || entitlements.claudePool !== PLANS.pro.claudeIncluded) {
	throw new Error(`upgrade: entitlements did not follow the new plan (got ${JSON.stringify(entitlements)})`);
}
console.log("✓ upgrade: resolved entitlements follow the new plan");

// --- 4. Add-on quantity ------------------------------------------------------
const addonPrice = await priceByLookupKey(CLAUDE_ADDON_LOOKUP_KEYS.monthly);
await stripe.subscriptionItems.create({ subscription: subscription.id, price: addonPrice, quantity: 7 });
await waitForDb("add-on: organization_settings.claude_addon_quantity = 7", async () => {
	const [row] = await db
		.select({ claudeAddonQuantity: organizationSettings.claudeAddonQuantity })
		.from(organizationSettings)
		.where(eq(organizationSettings.organizationId, orgId))
		.limit(1);
	return row?.claudeAddonQuantity === 7 ? row : null;
});

// --- 5. Payment failure at renewal ------------------------------------------
await stripe.customers.update(customer.id, {
	invoice_settings: { default_payment_method: undefined },
});
const failingCard = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: failingCard.id } });
await stripe.testHelpers.testClocks.advance(clock.id, {
	frozen_time: Math.floor(Date.now() / 1000) + 32 * 24 * 3600,
});
await expectStatus("renewal failure: subscription past_due", "past_due");

// --- 6. Recovery -------------------------------------------------------------
const goodCard = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: goodCard.id } });
const invoices = await stripe.invoices.list({ customer: customer.id, status: "open", limit: 1 });
if (invoices.data[0]?.id) await stripe.invoices.pay(invoices.data[0].id, { payment_method: goodCard.id });
await expectStatus("recovery: subscription active again", "active");

// --- 7. Cancel ---------------------------------------------------------------
await stripe.subscriptions.cancel(subscription.id);
await expectStatus("cancel: subscription canceled", "canceled");
await waitForDb("cancel: add-on quantity reset to 0", async () => {
	const [row] = await db
		.select({ claudeAddonQuantity: organizationSettings.claudeAddonQuantity })
		.from(organizationSettings)
		.where(eq(organizationSettings.organizationId, orgId))
		.limit(1);
	return row?.claudeAddonQuantity === 0 ? row : null;
});

console.log("\nStripe billing lifecycle verification PASSED");