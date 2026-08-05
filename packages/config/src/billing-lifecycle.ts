export const CLOUD_ACTIVE_SUBSCRIPTION_SYNC_GRACE_MS = 24 * 60 * 60 * 1_000;
export const CLOUD_PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1_000;

const CLOUD_RESTARTABLE_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

/** A new Checkout must never overlap a live or recoverable Stripe subscription. */
export function canStartCloudSubscriptionCheckout(status: string | null | undefined): boolean {
	return status == null || CLOUD_RESTARTABLE_SUBSCRIPTION_STATUSES.has(status);
}

export type CloudBillingLifecycleDenialReason =
	| "inactive-subscription"
	| "invalid-subscription-lifecycle"
	| "stale-subscription"
	| "payment-grace-expired";

export type CloudBillingLifecycleResolution =
	| { access: "allowed"; nextTransitionAt: Date }
	| { access: "denied"; reason: CloudBillingLifecycleDenialReason; nextTransitionAt: null };

export interface CloudBillingLifecycleSnapshot {
	status: string;
	currentPeriodEnd?: Date | null;
	delinquentSince?: Date | null;
}

function futureTransitionOrDenied(input: {
	now: Date;
	transitionAt: Date;
	expiredReason: "stale-subscription" | "payment-grace-expired";
}): CloudBillingLifecycleResolution {
	if (input.transitionAt <= input.now) {
		return { access: "denied", reason: input.expiredReason, nextTransitionAt: null };
	}
	return { access: "allowed", nextTransitionAt: input.transitionAt };
}

/**
 * Resolves the access window encoded by an authoritative Stripe projection.
 * Every caller receives the same future transition so request-time checks and
 * schedule reconciliation cannot disagree at a billing boundary.
 */
export function resolveCloudBillingLifecycle(
	snapshot: CloudBillingLifecycleSnapshot,
	now: Date,
): CloudBillingLifecycleResolution {
	if (snapshot.status === "active") {
		if (!snapshot.currentPeriodEnd || !Number.isFinite(snapshot.currentPeriodEnd.getTime())) {
			return { access: "denied", reason: "invalid-subscription-lifecycle", nextTransitionAt: null };
		}
		return futureTransitionOrDenied({
			now,
			transitionAt: new Date(snapshot.currentPeriodEnd.getTime() + CLOUD_ACTIVE_SUBSCRIPTION_SYNC_GRACE_MS),
			expiredReason: "stale-subscription",
		});
	}

	if (snapshot.status === "past_due") {
		if (
			!snapshot.delinquentSince ||
			!Number.isFinite(snapshot.delinquentSince.getTime()) ||
			snapshot.delinquentSince > now
		) {
			return { access: "denied", reason: "invalid-subscription-lifecycle", nextTransitionAt: null };
		}
		return futureTransitionOrDenied({
			now,
			transitionAt: new Date(snapshot.delinquentSince.getTime() + CLOUD_PAST_DUE_GRACE_MS),
			expiredReason: "payment-grace-expired",
		});
	}

	return { access: "denied", reason: "inactive-subscription", nextTransitionAt: null };
}
