import { describe, expect, it } from "vitest";
import {
	CLOUD_ACTIVE_SUBSCRIPTION_SYNC_GRACE_MS,
	CLOUD_PAST_DUE_GRACE_MS,
	canStartCloudSubscriptionCheckout,
	resolveCloudBillingLifecycle,
} from "./billing-lifecycle";

const now = new Date("2026-08-05T12:00:00.000Z");

describe("resolveCloudBillingLifecycle", () => {
	it("allows a new Checkout only after the previous Stripe subscription is terminal", () => {
		expect(canStartCloudSubscriptionCheckout(null)).toBe(true);
		expect(canStartCloudSubscriptionCheckout("canceled")).toBe(true);
		expect(canStartCloudSubscriptionCheckout("incomplete_expired")).toBe(true);
		for (const status of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete", "billing_conflict"]) {
			expect(canStartCloudSubscriptionCheckout(status)).toBe(false);
		}
	});

	it("allows an active subscription until its bounded synchronization deadline", () => {
		const currentPeriodEnd = new Date("2026-08-06T12:00:00.000Z");
		expect(resolveCloudBillingLifecycle({ status: "active", currentPeriodEnd }, now)).toEqual({
			access: "allowed",
			nextTransitionAt: new Date(currentPeriodEnd.getTime() + CLOUD_ACTIVE_SUBSCRIPTION_SYNC_GRACE_MS),
		});
	});

	it("fails closed once an active projection is stale", () => {
		const currentPeriodEnd = new Date(now.getTime() - CLOUD_ACTIVE_SUBSCRIPTION_SYNC_GRACE_MS);
		expect(resolveCloudBillingLifecycle({ status: "active", currentPeriodEnd }, now)).toEqual({
			access: "denied",
			reason: "stale-subscription",
			nextTransitionAt: null,
		});
	});

	it("allows payment recovery for exactly seven days", () => {
		const delinquentSince = new Date(now.getTime() - CLOUD_PAST_DUE_GRACE_MS + 1);
		expect(resolveCloudBillingLifecycle({ status: "past_due", delinquentSince }, now)).toEqual({
			access: "allowed",
			nextTransitionAt: new Date(delinquentSince.getTime() + CLOUD_PAST_DUE_GRACE_MS),
		});

		delinquentSince.setTime(now.getTime() - CLOUD_PAST_DUE_GRACE_MS);
		expect(resolveCloudBillingLifecycle({ status: "past_due", delinquentSince }, now)).toEqual({
			access: "denied",
			reason: "payment-grace-expired",
			nextTransitionAt: null,
		});
	});

	it("denies missing or future lifecycle timestamps and every non-launch status", () => {
		expect(resolveCloudBillingLifecycle({ status: "active" }, now).access).toBe("denied");
		expect(
			resolveCloudBillingLifecycle({ status: "past_due", delinquentSince: new Date(now.getTime() + 1) }, now).access,
		).toBe("denied");
		for (const status of ["trialing", "unpaid", "canceled", "incomplete", "paused"]) {
			expect(resolveCloudBillingLifecycle({ status }, now)).toEqual({
				access: "denied",
				reason: "inactive-subscription",
				nextTransitionAt: null,
			});
		}
	});
});
