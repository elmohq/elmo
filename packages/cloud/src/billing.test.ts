import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
	type CloudBillingAuthorizationSnapshot,
	cloudSelfServeCheckoutSessionParams,
	cloudSelfServeSubscriptionMetadata,
	createCloudBillingRuntime,
	createCloudOrganizationReferenceAuthorizer,
	validateCloudBillingPortalConfiguration,
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

function portalConfiguration(
	overrides: Partial<{
		active: boolean;
		paymentMethodUpdate: boolean;
		invoiceHistory: boolean;
		subscriptionCancel: boolean;
		cancelMode: string;
		subscriptionUpdate: boolean;
	}> = {},
) {
	return {
		active: overrides.active ?? true,
		features: {
			payment_method_update: { enabled: overrides.paymentMethodUpdate ?? true },
			invoice_history: { enabled: overrides.invoiceHistory ?? true },
			subscription_cancel: {
				enabled: overrides.subscriptionCancel ?? true,
				mode: overrides.cancelMode ?? "at_period_end",
			},
			subscription_update: { enabled: overrides.subscriptionUpdate ?? false },
		},
	};
}

describe("cloud Stripe billing runtime", () => {
	it("allows members to read billing but only admins to manage it", async () => {
		let snapshot: CloudBillingAuthorizationSnapshot | null = {
			role: "member",
			planId: "pro",
			status: "active",
		};
		const store = { load: vi.fn(async () => snapshot) };
		const authorize = createCloudOrganizationReferenceAuthorizer(store);

		await expect(
			authorize({ user: { id: "user_1" }, referenceId: "org_1", action: "list-subscription" }),
		).resolves.toBe(true);
		await expect(authorize({ user: { id: "user_1" }, referenceId: "org_1", action: "billing-portal" })).resolves.toBe(
			false,
		);

		snapshot = { ...snapshot, role: "admin" };
		await expect(
			authorize({ user: { id: "user_1" }, referenceId: "org_1", action: "cancel-subscription" }),
		).resolves.toBe(true);
		await expect(authorize({ user: { id: "user_1" }, referenceId: "org_1", action: "billing-portal" })).resolves.toBe(
			false,
		);
		expect(store.load).toHaveBeenCalledWith("org_1", "user_1");
	});

	it("reserves every Better Auth upgrade for Elmo's durable checkout control", async () => {
		let snapshot: CloudBillingAuthorizationSnapshot | null = {
			role: "admin",
			planId: null,
			status: null,
		};
		const authorize = createCloudOrganizationReferenceAuthorizer({ load: async () => snapshot });

		await expect(
			authorize(
				{ user: { id: "user_1" }, referenceId: "org_1", action: "upgrade-subscription" },
				{ body: { plan: "starter" } },
			),
		).resolves.toBe(false);
		snapshot = { role: "admin", planId: "pro", status: "active" };
		await expect(
			authorize({ user: { id: "user_1" }, referenceId: "org_1", action: "upgrade-subscription" }),
		).resolves.toBe(false);
		snapshot = { role: "owner", planId: "custom", status: "active" };
		await expect(authorize({ user: { id: "user_1" }, referenceId: "org_1", action: "billing-portal" })).resolves.toBe(
			false,
		);
	});

	it("constructs the Better Auth Stripe plugin for the injected client and store", () => {
		const stripeClient = {} as Stripe;
		const runtime = createCloudBillingRuntime({
			stripeClient,
			stripeWebhookSecret: "whsec_test",
			billingPortalConfigurationId: "bpc_safe",
			store: membershipStore(false),
			authorizationStore: { load: async () => null },
		});

		expect(runtime.stripeClient).toBe(stripeClient);
		expect(runtime.plugin.id).toBe("stripe");
		expect(runtime.handleEvent).toBeTypeOf("function");
	});

	it("rejects a portal configuration that permits subscription updates", async () => {
		const retrieve = vi.fn(async () => portalConfiguration({ subscriptionUpdate: true }));
		const stripeClient = { billingPortal: { configurations: { retrieve } } } as unknown as Stripe;

		await expect(validateCloudBillingPortalConfiguration(stripeClient, "bpc_unsafe")).rejects.toThrow(
			/subscription_update must be disabled/,
		);
	});

	it("requires the portal recovery actions promised by the billing page", async () => {
		const retrieve = vi.fn(async () => portalConfiguration());
		const stripeClient = { billingPortal: { configurations: { retrieve } } } as unknown as Stripe;

		await expect(validateCloudBillingPortalConfiguration(stripeClient, "bpc_safe")).resolves.toBeUndefined();

		retrieve.mockResolvedValueOnce(portalConfiguration({ paymentMethodUpdate: false }));
		await expect(validateCloudBillingPortalConfiguration(stripeClient, "bpc_no_payment_update")).rejects.toThrow(
			/payment_method_update must be enabled/,
		);

		retrieve.mockResolvedValueOnce(portalConfiguration({ invoiceHistory: false }));
		await expect(validateCloudBillingPortalConfiguration(stripeClient, "bpc_no_invoices")).rejects.toThrow(
			/invoice_history must be enabled/,
		);

		retrieve.mockResolvedValueOnce(portalConfiguration({ cancelMode: "immediately" }));
		await expect(validateCloudBillingPortalConfiguration(stripeClient, "bpc_immediate_cancel")).rejects.toThrow(
			/subscription_cancel must use at_period_end mode/,
		);
	});

	it("reserves and overwrites the custom-plan metadata keys for self-serve checkout", () => {
		expect(cloudSelfServeSubscriptionMetadata("pro")).toEqual({
			elmo_plan_id: "pro",
			elmo_billing_source: "better-auth",
		});
	});

	it("enables Stripe Tax for every self-serve checkout", () => {
		expect(cloudSelfServeCheckoutSessionParams("business")).toEqual({
			params: {
				automatic_tax: { enabled: true },
				subscription_data: {
					metadata: {
						elmo_plan_id: "business",
						elmo_billing_source: "better-auth",
					},
				},
			},
		});
	});

	it("fails construction without a webhook signing secret", () => {
		expect(() =>
			createCloudBillingRuntime({
				stripeClient: {} as Stripe,
				stripeWebhookSecret: "",
				store: membershipStore(false),
				authorizationStore: { load: async () => null },
			}),
		).toThrow(/STRIPE_WEBHOOK_SECRET must be set/);
	});
});
