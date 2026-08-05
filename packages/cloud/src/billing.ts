import { stripe as betterAuthStripe } from "@better-auth/stripe";
import { db } from "@workspace/lib/db/db";
import { member, organizationBillingSubscriptions } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { CLOUD_STRIPE_PLANS, validateCloudStripePriceCatalog } from "./billing-catalog";
import {
	CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY,
	CLOUD_STRIPE_PLAN_METADATA_KEY,
	CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
	createCloudStripeEventHandler,
} from "./billing-events";
import { type CloudBillingStore, createDrizzleCloudBillingStore } from "./billing-store";
import { createCloudStripeClient } from "./stripe-client";

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

/**
 * Better Auth owns webhook and subscription-record integration. Its generic
 * write and portal endpoints stay closed so every Stripe mutation uses Elmo's
 * durable controls and validated portal configuration.
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
		return false;
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
	if (!configuration.features.payment_method_update.enabled) {
		errors.push("payment_method_update must be enabled for payment recovery");
	}
	if (!configuration.features.invoice_history.enabled) {
		errors.push("invoice_history must be enabled so customers can pay and inspect invoices");
	}
	if (!configuration.features.subscription_cancel.enabled) {
		errors.push("subscription_cancel must be enabled");
	} else if (configuration.features.subscription_cancel.mode !== "at_period_end") {
		errors.push("subscription_cancel must use at_period_end mode");
	}
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
