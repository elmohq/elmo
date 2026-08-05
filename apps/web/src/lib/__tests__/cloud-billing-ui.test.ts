import { describe, expect, it } from "vitest";
import {
	canStartCloudCheckout,
	cloudBillingPath,
	isProjectedCloudSubscriptionActive,
	maximumSelectedTargets,
	resolveCloudBillingNotice,
	resolveNewBrandWorkspace,
} from "../cloud-billing-ui";

type NoticeSubscription = NonNullable<Parameters<typeof resolveCloudBillingNotice>[0]["subscription"]>;

function subscription(overrides: Partial<NoticeSubscription> = {}): NoticeSubscription {
	return {
		status: "active",
		stripeCustomerId: "cus_1",
		cancelAtPeriodEnd: false,
		currentPeriodEnd: "2026-09-01T00:00:00.000Z",
		cancelAt: null,
		canceledAt: null,
		endedAt: null,
		...overrides,
	};
}

const allowedLifecycle = { access: "allowed" as const, reason: null, transitionAt: null };

describe("cloud billing UI decisions", () => {
	it("preserves the legacy organization-without-brand flow", () => {
		expect(
			resolveNewBrandWorkspace({
				mode: "whitelabel",
				organizationIds: ["customer"],
				requestedOrganizationId: "customer",
			}),
		).toEqual({ kind: "legacy", organizationId: "customer" });
	});

	it("requires an active projected subscription before cloud brand creation", () => {
		expect(
			resolveNewBrandWorkspace({ mode: "cloud", organizationIds: ["org"], activeCloudOrganizationIds: new Set() }),
		).toEqual({ kind: "billing", organizationId: "org" });
		expect(
			resolveNewBrandWorkspace({
				mode: "cloud",
				organizationIds: ["org"],
				activeCloudOrganizationIds: new Set(["org"]),
			}),
		).toEqual({ kind: "create", organizationId: "org" });
	});

	it("requires an explicit choice for multiple cloud workspaces", () => {
		expect(resolveNewBrandWorkspace({ mode: "cloud", organizationIds: ["one", "two"] })).toEqual({
			kind: "choose-workspace",
		});
		expect(() =>
			resolveNewBrandWorkspace({
				mode: "cloud",
				organizationIds: ["one"],
				requestedOrganizationId: "other",
			}),
		).toThrow(/Forbidden/);
	});

	it("builds encoded checkout return paths and usage summaries", () => {
		expect(cloudBillingPath("org/one", { checkout: "success", returnTo: "/app/new?organization=org/one" })).toBe(
			"/app/workspaces/org%2Fone/billing?checkout=success&returnTo=%2Fapp%2Fnew%3Forganization%3Dorg%2Fone",
		);
		expect(isProjectedCloudSubscriptionActive({ status: "active" })).toBe(true);
		expect(isProjectedCloudSubscriptionActive({ status: "trialing" })).toBe(false);
		expect(maximumSelectedTargets([{ targetKeys: ["one"] }, { targetKeys: ["one", "two"] }])).toBe(2);
	});

	it("starts a new Checkout only when no subscription exists or Stripe says the old one is terminal", () => {
		expect(canStartCloudCheckout(null)).toBe(true);
		expect(canStartCloudCheckout({ status: "canceled" })).toBe(true);
		expect(canStartCloudCheckout({ status: "incomplete_expired" })).toBe(true);
		for (const status of ["active", "past_due", "unpaid", "incomplete", "billing_conflict"]) {
			expect(canStartCloudCheckout({ status })).toBe(false);
		}
	});

	it("directs a past-due customer to Stripe before the canonical grace deadline", () => {
		expect(
			resolveCloudBillingNotice({
				subscription: subscription({ status: "past_due" }),
				lifecycle: {
					access: "allowed",
					reason: null,
					transitionAt: "2026-08-08T00:00:00.000Z",
				},
				canManage: true,
				selfServe: true,
			}),
		).toEqual({
			kind: "payment-past-due",
			variant: "destructive",
			action: "portal",
			effectiveAt: "2026-08-08T00:00:00.000Z",
		});
	});

	it("makes grace expiry and stale projections explicit without offering another Checkout", () => {
		expect(
			resolveCloudBillingNotice({
				subscription: subscription({ status: "past_due" }),
				lifecycle: { access: "denied", reason: "payment-grace-expired", transitionAt: null },
				canManage: true,
				selfServe: true,
			}),
		).toMatchObject({ kind: "payment-grace-expired", action: "portal" });
		expect(
			resolveCloudBillingNotice({
				subscription: subscription(),
				lifecycle: { access: "denied", reason: "stale-subscription", transitionAt: null },
				canManage: true,
				selfServe: true,
			}),
		).toMatchObject({ kind: "billing-state-invalid", action: "support" });
	});

	it("shows scheduled and completed cancellation dates with the appropriate recovery action", () => {
		expect(
			resolveCloudBillingNotice({
				subscription: subscription({ cancelAtPeriodEnd: true }),
				lifecycle: allowedLifecycle,
				canManage: true,
				selfServe: true,
			}),
		).toMatchObject({
			kind: "cancellation-scheduled",
			action: "portal",
			effectiveAt: "2026-09-01T00:00:00.000Z",
		});
		expect(
			resolveCloudBillingNotice({
				subscription: subscription({
					status: "canceled",
					canceledAt: "2026-08-04T00:00:00.000Z",
					endedAt: "2026-09-01T00:00:00.000Z",
				}),
				lifecycle: { access: "denied", reason: "inactive-subscription", transitionAt: null },
				canManage: true,
				selfServe: true,
			}),
		).toMatchObject({
			kind: "subscription-ended",
			action: "choose-plan",
			effectiveAt: "2026-09-01T00:00:00.000Z",
		});
	});

	it("locks a conflicting Stripe projection to support review", () => {
		expect(
			resolveCloudBillingNotice({
				subscription: subscription({ status: "billing_conflict" }),
				lifecycle: { access: "denied", reason: "inactive-subscription", transitionAt: null },
				canManage: true,
				selfServe: true,
			}),
		).toEqual({
			kind: "billing-conflict",
			variant: "destructive",
			action: "support",
			effectiveAt: null,
		});
	});
});
