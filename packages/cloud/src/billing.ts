import { stripe as betterAuthStripe } from "@better-auth/stripe";
import Stripe from "stripe";
import { createCloudStripeClient } from "./stripe-client";
import { CLOUD_STRIPE_PLANS, validateCloudStripePriceCatalog } from "./billing-catalog";
import {
	CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY,
	CLOUD_STRIPE_PLAN_METADATA_KEY,
	CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
	createCloudStripeEventHandler,
} from "./billing-events";
import { type CloudBillingStore, createDrizzleCloudBillingStore } from "./billing-store";
import { db } from "@workspace/lib/db/db";
import { member, organizationBillingSubscriptions } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";

export type CloudBillingReferenceAction =
	| "upgrade-subscription"
	| "list-subscription"
	| "cancel-subscription"
	| "restore-subscription"
	| "billing-portal";

export interface CloudBillingAuthorizationSnapshot {
	role: string;
	planId: string | null;
	status: string | null;
}

export interface CloudBillingAuthorizationStore {
	load(organizationId: string, userId: string): Promise<CloudBillingAuthorizationSnapshot | null>;
}

export interface CreateCloudBillingRuntimeOptions {
	stripeClient?: Stripe;
	stripeSecretKey?: string;
	stripeWebhookSecret?: string;
	billingPortalConfigurationId?: string;
	store?: CloudBillingStore;
	authorizationStore?: CloudBillingAuthorizationStore;
	now?: () => Date;
}

export interface ValidateCloudBillingStartupOptions {
	stripeClient?: Stripe;
	stripeSecretKey?: string;
	billingPortalConfigurationId?: string;
}

export function cloudSelfServeSubscriptionMetadata(planId: string): Record<string, string> {
	return {
		[CLOUD_STRIPE_PLAN_METADATA_KEY]: planId,
		[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY]: CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
	};
}

export function cloudSelfServeCheckoutSessionParams(planId: string) {
	return {
		params: {
			automatic_tax: { enabled: true },
			subscription_data: {
				metadata: cloudSelfServeSubscriptionMetadata(planId),
			},
		} satisfies Stripe.Checkout.SessionCreateParams,
	};
}

export function createDrizzleCloudBillingAuthorizationStore(): CloudBillingAuthorizationStore {
	return {
		async load(organizationId, userId) {
			const [snapshot] = await db
				.select({
					role: member.role,
					planId: organizationBillingSubscriptions.basePlanKey,
					status: organizationBillingSubscriptions.status,
				})
				.from(member)
				.leftJoin(
					organizationBillingSubscriptions,
					eq(organizationBillingSubscriptions.organizationId, member.organizationId),
				)
				.where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
				.limit(1);
			return snapshot ?? null;
		},
	};
}

function canManageBilling(role: string): boolean {
	return role === "admin" || role === "owner";
}

/**
 * Better Auth remains the initial-checkout transport, while this policy
 * prevents its generic upgrade and portal endpoints from bypassing Elmo's
 * validated billing controls once an organization is subscribed.
 */

export function createCloudOrganizationReferenceAuthorizer(store: CloudBillingAuthorizationStore) {
	return async (
		{
			user,
			referenceId,
			action,
		}: {
			user: { id: string };
			referenceId: string;
			action: CloudBillingReferenceAction;
		},
		_context?: unknown,
	): Promise<boolean> => {
		const snapshot = await store.load(referenceId, user.id);
		if (!snapshot) return false;
		if (action === "list-subscription") return true;
		if (!canManageBilling(snapshot.role) || snapshot.planId === "custom") return false;
		// Better Auth creates an unrestricted default portal session. Elmo's
		// server control uses a separately validated Stripe configuration.
		if (action === "billing-portal") return false;
		// Elmo's durable checkout and mutation controls are the only write path.
		// Better Auth remains the webhook/subscription-record integration.
		if (action === "upgrade-subscription") return false;
		return true;
	};
}

function requireSecret(name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET", value: string | undefined): string {
	if (!value?.trim()) throw new Error(`${name} must be set for cloud billing`);
	return value;
}

function requirePortalConfigurationId(value: string | undefined): string {
	if (!value?.trim()) throw new Error("STRIPE_BILLING_PORTAL_CONFIGURATION_ID must be set for cloud billing");
	return value;
}

export { createCloudStripeClient } from "./stripe-client";

/**
 * Constructs one shared Stripe client, Better Auth plugin, and authoritative
 * event handler. The caller should add `plugin` to Better Auth and call
 * `validateStartup` before accepting traffic.
 */
export function createCloudBillingRuntime(options: CreateCloudBillingRuntimeOptions = {}) {
	const stripeClient = options.stripeClient ?? createCloudStripeClient(options.stripeSecretKey);
	const stripeWebhookSecret = requireSecret(
		"STRIPE_WEBHOOK_SECRET",
		options.stripeWebhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET,
	);
	const billingPortalConfigurationId = requirePortalConfigurationId(
		options.billingPortalConfigurationId ?? process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID,
	);
	const store = options.store ?? createDrizzleCloudBillingStore();
	const handleEvent = createCloudStripeEventHandler({
		stripeClient,
		store,
		now: options.now,
	});
	const authorizeReference = createCloudOrganizationReferenceAuthorizer(
		options.authorizationStore ?? createDrizzleCloudBillingAuthorizationStore(),
	);

	const plugin = betterAuthStripe({
		stripeClient,
		stripeWebhookSecret,
		createCustomerOnSignUp: false,
		organization: { enabled: true },
		subscription: {
			enabled: true,
			plans: CLOUD_STRIPE_PLANS,
			requireEmailVerification: true,
			authorizeReference,
			getCheckoutSessionParams: async ({ plan }) => cloudSelfServeCheckoutSessionParams(plan.name),
		},
		onEvent: handleEvent,
	});

	return {
		stripeClient,
		billingPortalConfigurationId,
		plugin,
		handleEvent,
		validateStartup: async () => {
			await Promise.all([
				validateCloudStripePriceCatalog(stripeClient),
				validateCloudBillingPortalConfiguration(stripeClient, billingPortalConfigurationId),
			]);
		},
	};
}

export function createCloudStripePlugin(options: CreateCloudBillingRuntimeOptions = {}) {
	return createCloudBillingRuntime(options).plugin;
}

export async function validateCloudBillingStartup(options: ValidateCloudBillingStartupOptions = {}): Promise<void> {
	const stripeClient = options.stripeClient ?? createCloudStripeClient(options.stripeSecretKey);
	const billingPortalConfigurationId = requirePortalConfigurationId(
		options.billingPortalConfigurationId ?? process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID,
	);
	await Promise.all([
		validateCloudStripePriceCatalog(stripeClient),
		validateCloudBillingPortalConfiguration(stripeClient, billingPortalConfigurationId),
	]);
}

export async function validateCloudBillingPortalConfiguration(
	stripeClient: Stripe,
	configurationId: string,
): Promise<void> {
	const configuration = await stripeClient.billingPortal.configurations.retrieve(configurationId);
	const errors: string[] = [];
	if (!configuration.active) errors.push("configuration is inactive");
	if (configuration.features.subscription_update.enabled) {
		errors.push("subscription_update must be disabled so plan and quantity validation cannot be bypassed");
	}
	if (errors.length > 0) {
		throw new Error(`Stripe billing portal configuration ${configurationId} is unsafe: ${errors.join("; ")}`);
	}
}

export type {
	BuildCloudBillingSubscriptionProjectionOptions,
	CreateCloudStripeEventHandlerOptions,
} from "./billing-events";
export {
	buildCloudBillingSubscriptionProjection,
	CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY,
	CLOUD_STRIPE_CUSTOM_BILLING_SOURCE,
	CLOUD_STRIPE_PLAN_METADATA_KEY,
	CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
	createCloudStripeEventHandler,
} from "./billing-events";
export type {
	CloudBillingProjectionDecision,
	CloudBillingProjectionWriter,
	CloudBillingStore,
	CloudBillingSubscriptionItemProjection,
	CloudBillingSubscriptionProjection,
	CloudStripeWebhookClaim,
	CloudStripeWebhookClaimResult,
	CloudStripeWebhookEnvelope,
	ExistingCloudBillingProjection,
} from "./billing-store";
export { createDrizzleCloudBillingStore, decideCloudBillingProjectionReplacement } from "./billing-store";
