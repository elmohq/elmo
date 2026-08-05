import { stripe as betterAuthStripe } from "@better-auth/stripe";
import Stripe from "stripe";
import { CLOUD_STRIPE_PLANS, validateCloudStripePriceCatalog } from "./billing-catalog";
import {
	CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY,
	CLOUD_STRIPE_PLAN_METADATA_KEY,
	createCloudStripeEventHandler,
} from "./billing-events";
import { type CloudBillingStore, createDrizzleCloudBillingStore } from "./billing-store";

export interface CreateCloudBillingRuntimeOptions {
	stripeClient?: Stripe;
	stripeSecretKey?: string;
	stripeWebhookSecret?: string;
	store?: CloudBillingStore;
	now?: () => Date;
}

export interface ValidateCloudBillingStartupOptions {
	stripeClient?: Stripe;
	stripeSecretKey?: string;
}

export const CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE = "better-auth";

export function cloudSelfServeSubscriptionMetadata(planId: string): Record<string, string> {
	return {
		[CLOUD_STRIPE_PLAN_METADATA_KEY]: planId,
		[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY]: CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
	};
}

export function createCloudOrganizationReferenceAuthorizer(store: CloudBillingStore) {
	return async ({ user, referenceId }: { user: { id: string }; referenceId: string }): Promise<boolean> =>
		store.hasOrganizationMembership(referenceId, user.id);
}

function requireSecret(name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET", value: string | undefined): string {
	if (!value?.trim()) throw new Error(`${name} must be set for cloud billing`);
	return value;
}

export function createCloudStripeClient(secretKey = process.env.STRIPE_SECRET_KEY): Stripe {
	return new Stripe(requireSecret("STRIPE_SECRET_KEY", secretKey), {
		appInfo: { name: "Elmo Cloud" },
	});
}

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
	const store = options.store ?? createDrizzleCloudBillingStore();
	const handleEvent = createCloudStripeEventHandler({
		stripeClient,
		store,
		now: options.now,
	});
	const authorizeReference = createCloudOrganizationReferenceAuthorizer(store);

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
			getCheckoutSessionParams: async ({ plan }) => ({
				params: {
					subscription_data: {
						metadata: cloudSelfServeSubscriptionMetadata(plan.name),
					},
				},
			}),
		},
		onEvent: handleEvent,
	});

	return {
		stripeClient,
		plugin,
		handleEvent,
		validateStartup: () => validateCloudStripePriceCatalog(stripeClient),
	};
}

export function createCloudStripePlugin(options: CreateCloudBillingRuntimeOptions = {}) {
	return createCloudBillingRuntime(options).plugin;
}

export async function validateCloudBillingStartup(options: ValidateCloudBillingStartupOptions = {}): Promise<void> {
	const stripeClient = options.stripeClient ?? createCloudStripeClient(options.stripeSecretKey);
	await validateCloudStripePriceCatalog(stripeClient);
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
