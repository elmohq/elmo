export const CLOUD_STRIPE_PLAN_METADATA_KEY = "elmo_plan_id";
export const CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY = "elmo_billing_source";
export const CLOUD_STRIPE_CUSTOM_BILLING_SOURCE = "operator";
export const CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE = "better-auth";

export function hasManagedCloudBillingMetadata(metadata: Record<string, string> | null | undefined): boolean {
	const source = metadata?.[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY];
	const plan = metadata?.[CLOUD_STRIPE_PLAN_METADATA_KEY];
	return (
		(source === CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE && typeof plan === "string" && plan.length > 0) ||
		(source === CLOUD_STRIPE_CUSTOM_BILLING_SOURCE && plan === "custom")
	);
}
