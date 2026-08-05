import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
	cloudSelfServeSubscriptionMetadata,
	createCloudBillingRuntime,
	createCloudOrganizationReferenceAuthorizer,
	type CloudBillingAuthorizationSnapshot,
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

	it("reserves Better Auth upgrades for initial checkout and denies custom self-service", async () => {
		let snapshot: CloudBillingAuthorizationSnapshot | null = {
			role: "admin",
			planId: null,
			status: null,
		};
		const validateCheckout = vi.fn(async () => true);
		const authorize = createCloudOrganizationReferenceAuthorizer(
			{ load: async () => snapshot },
			{ validate: validateCheckout },
		);

		await expect(
			authorize(
				{ user: { id: "user_1" }, referenceId: "org_1", action: "upgrade-subscription" },
				{ body: { plan: "starter" } },
			),
		).resolves.toBe(true);
		expect(validateCheckout).toHaveBeenCalledWith("org_1", "starter");
		snapshot = { role: "admin", planId: "pro", status: "active" };
		await expect(
			authorize({ user: { id: "user_1" }, referenceId: "org_1", action: "upgrade-subscription" }),
		).resolves.toBe(false);
		snapshot = { role: "owner", planId: "custom", status: "active" };
		await expect(authorize({ user: { id: "user_1" }, referenceId: "org_1", action: "billing-portal" })).resolves.toBe(
			false,
		);
	});

	it("does not let the generic upgrade endpoint bypass restart capacity validation", async () => {
		const validateCheckout = vi.fn(async () => false);
		const authorize = createCloudOrganizationReferenceAuthorizer(
			{ load: async () => ({ role: "admin", planId: "pro", status: "canceled" }) },
			{ validate: validateCheckout },
		);

		await expect(
			authorize(
				{ user: { id: "user_1" }, referenceId: "org_1", action: "upgrade-subscription" },
				{ body: { plan: "starter" } },
			),
		).resolves.toBe(false);
		expect(validateCheckout).toHaveBeenCalledWith("org_1", "starter");
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
		const retrieve = vi.fn(async () => ({
			active: true,
			features: { subscription_update: { enabled: true } },
		}));
		const stripeClient = { billingPortal: { configurations: { retrieve } } } as unknown as Stripe;

		await expect(validateCloudBillingPortalConfiguration(stripeClient, "bpc_unsafe")).rejects.toThrow(
			/subscription_update must be disabled/,
		);
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
				authorizationStore: { load: async () => null },
			}),
		).toThrow(/STRIPE_WEBHOOK_SECRET must be set/);
	});
});
