import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
	cloudSelfServeSubscriptionMetadata,
	createCloudBillingRuntime,
	createCloudOrganizationReferenceAuthorizer,
} from "./billing";
import type { CloudBillingProjectionWriter, CloudBillingStore, CloudStripeWebhookClaimResult } from "./billing-store";

function membershipStore(allowed: boolean): CloudBillingStore {
	return {
		hasOrganizationMembership: vi.fn(async () => allowed),
		findOrganizationIdByStripeCustomerId: vi.fn(async () => null),
		claimWebhookEvent: vi.fn(async (): Promise<CloudStripeWebhookClaimResult> => ({ state: "complete" })),
		finishWebhookEvent: vi.fn(async () => undefined),
		failWebhookEvent: vi.fn(async () => undefined),
		withOrganizationProjection: async <T>(
			_organizationId: string,
			operation: (writer: CloudBillingProjectionWriter) => Promise<T>,
		) => operation({ replaceSubscription: async () => ({ applied: true }) }),
	};
}

describe("cloud Stripe billing runtime", () => {
	it("authorizes an organization reference only through membership", async () => {
		const store = membershipStore(true);
		const authorize = createCloudOrganizationReferenceAuthorizer(store);

		await expect(authorize({ user: { id: "user_1" }, referenceId: "org_1" })).resolves.toBe(true);
		expect(store.hasOrganizationMembership).toHaveBeenCalledWith("org_1", "user_1");
	});

	it("constructs the Better Auth Stripe plugin for the injected client and store", () => {
		const stripeClient = {} as Stripe;
		const runtime = createCloudBillingRuntime({
			stripeClient,
			stripeWebhookSecret: "whsec_test",
			store: membershipStore(false),
		});

		expect(runtime.stripeClient).toBe(stripeClient);
		expect(runtime.plugin.id).toBe("stripe");
		expect(runtime.handleEvent).toBeTypeOf("function");
	});

	it("reserves and overwrites the custom-plan metadata keys for self-serve checkout", () => {
		expect(cloudSelfServeSubscriptionMetadata("pro")).toEqual({
			elmo_plan_id: "pro",
			elmo_billing_source: "better-auth",
		});
	});

	it("fails construction without a webhook signing secret", () => {
		expect(() =>
			createCloudBillingRuntime({
				stripeClient: {} as Stripe,
				stripeWebhookSecret: "",
				store: membershipStore(false),
			}),
		).toThrow(/STRIPE_WEBHOOK_SECRET must be set/);
	});
});
