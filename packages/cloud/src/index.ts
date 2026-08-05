/**
 * @workspace/cloud - Elmo Cloud deployment package
 *
 * Provides the managed deployment configuration, cloud auth/email behavior,
 * and the Stripe billing control plane used by the shared applications.
 */

export type {
	BuildCloudBillingSubscriptionProjectionOptions,
	CloudBillingProjectionDecision,
	CloudBillingProjectionWriter,
	CloudBillingStore,
	CloudBillingSubscriptionItemProjection,
	CloudBillingSubscriptionProjection,
	CloudStripeWebhookClaim,
	CloudStripeWebhookClaimResult,
	CloudStripeWebhookEnvelope,
	CreateCloudBillingRuntimeOptions,
	CreateCloudStripeEventHandlerOptions,
	ExistingCloudBillingProjection,
	ValidateCloudBillingStartupOptions,
} from "./billing";
export {
	buildCloudBillingSubscriptionProjection,
	CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY,
	CLOUD_STRIPE_CUSTOM_BILLING_SOURCE,
	CLOUD_STRIPE_PLAN_METADATA_KEY,
	CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
	cloudSelfServeSubscriptionMetadata,
	createCloudBillingRuntime,
	createCloudOrganizationReferenceAuthorizer,
	createCloudStripeClient,
	createCloudStripeEventHandler,
	createCloudStripePlugin,
	createDrizzleCloudBillingStore,
	decideCloudBillingProjectionReplacement,
	validateCloudBillingStartup,
} from "./billing";
export { CLOUD_STRIPE_PLANS, identifyCloudPrice, validateCloudStripePriceCatalog } from "./billing-catalog";
export { createCloudDeployment } from "./deployment";
export { CLAUDE_NATIVE_WEB_TARGET_KEY, validateCloudTrackingTargets } from "./tracking-targets";
