import { canStartCloudSubscriptionCheckout } from "@workspace/config/billing-lifecycle";
import type { DeploymentMode } from "@workspace/config/types";

export const CLOUD_BILLING_POLL_INTERVAL_MS = 1_500;
export const CLOUD_BILLING_MAX_POLL_ATTEMPTS = 30;

export type NewBrandWorkspaceDecision =
	| { kind: "legacy"; organizationId: string | null }
	| { kind: "choose-workspace" }
	| { kind: "create"; organizationId: string }
	| { kind: "billing"; organizationId: string };

export function resolveNewBrandWorkspace(input: {
	mode: DeploymentMode;
	organizationIds: string[];
	requestedOrganizationId?: string;
	activeCloudOrganizationIds?: ReadonlySet<string>;
}): NewBrandWorkspaceDecision {
	if (input.mode !== "cloud") {
		return {
			kind: "legacy",
			organizationId:
				input.requestedOrganizationId ?? (input.organizationIds.length === 1 ? input.organizationIds[0] : null),
		};
	}

	const requested = input.requestedOrganizationId;
	if (requested && !input.organizationIds.includes(requested)) {
		throw new Error("Forbidden: No access to this organization");
	}
	const organizationId = requested ?? (input.organizationIds.length === 1 ? input.organizationIds[0] : undefined);
	if (!organizationId) return { kind: "choose-workspace" };
	return input.activeCloudOrganizationIds?.has(organizationId)
		? { kind: "create", organizationId }
		: { kind: "billing", organizationId };
}

export function isProjectedCloudSubscriptionActive(subscription: { status: string } | null): boolean {
	return subscription?.status === "active";
}

export function canStartCloudCheckout(subscription: { status: string } | null): boolean {
	return canStartCloudSubscriptionCheckout(subscription?.status);
}

export type CloudBillingNoticeKind =
	| "billing-change-pending"
	| "billing-conflict"
	| "billing-state-invalid"
	| "cancellation-scheduled"
	| "checkout-expired"
	| "payment-grace-expired"
	| "payment-past-due"
	| "subscription-ended"
	| "subscription-inactive";

export interface CloudBillingNotice {
	kind: CloudBillingNoticeKind;
	variant: "default" | "destructive";
	action: "portal" | "support" | "choose-plan" | null;
	effectiveAt: string | null;
}

interface CloudBillingNoticeSubscription {
	status: string;
	stripeCustomerId: string;
	cancelAtPeriodEnd: boolean;
	currentPeriodEnd: string | null;
	cancelAt: string | null;
	canceledAt: string | null;
	endedAt: string | null;
}

export function resolveCloudBillingNotice(input: {
	subscription: CloudBillingNoticeSubscription | null;
	lifecycle: { access: "allowed" | "denied"; reason: string | null; transitionAt: string | null };
	canManage: boolean;
	selfServe: boolean;
}): CloudBillingNotice | null {
	const subscription = input.subscription;
	const portalAction = input.canManage && subscription?.stripeCustomerId ? "portal" : null;
	const choosePlanAction = input.selfServe ? (input.canManage ? "choose-plan" : null) : "support";

	if (subscription?.status === "billing_conflict") {
		return {
			kind: "billing-conflict",
			variant: "destructive",
			action: "support",
			effectiveAt: null,
		};
	}

	if (input.lifecycle.reason === "billing-change-pending") {
		return {
			kind: "billing-change-pending",
			variant: "default",
			action: null,
			effectiveAt: null,
		};
	}

	if (input.lifecycle.reason === "stale-subscription" || input.lifecycle.reason === "invalid-subscription-lifecycle") {
		return {
			kind: "billing-state-invalid",
			variant: "destructive",
			action: "support",
			effectiveAt: null,
		};
	}

	if (subscription?.status === "past_due") {
		if (input.lifecycle.reason === "payment-grace-expired") {
			return {
				kind: "payment-grace-expired",
				variant: "destructive",
				action: portalAction,
				effectiveAt: null,
			};
		}
		if (input.lifecycle.access === "allowed") {
			return {
				kind: "payment-past-due",
				variant: "destructive",
				action: portalAction,
				effectiveAt: input.lifecycle.transitionAt,
			};
		}
		return {
			kind: "billing-state-invalid",
			variant: "destructive",
			action: "support",
			effectiveAt: null,
		};
	}

	if (subscription?.status === "incomplete_expired") {
		return {
			kind: "checkout-expired",
			variant: "default",
			action: choosePlanAction,
			effectiveAt: null,
		};
	}

	if (subscription?.status === "canceled" || subscription?.endedAt) {
		return {
			kind: "subscription-ended",
			variant: "destructive",
			action: choosePlanAction,
			effectiveAt: subscription.endedAt ?? subscription.canceledAt ?? subscription.currentPeriodEnd,
		};
	}

	if (subscription?.status === "active" && input.lifecycle.access === "denied") {
		return {
			kind: "billing-state-invalid",
			variant: "destructive",
			action: "support",
			effectiveAt: null,
		};
	}

	if (subscription?.status === "active" && (subscription.cancelAtPeriodEnd || subscription.cancelAt)) {
		return {
			kind: "cancellation-scheduled",
			variant: "default",
			action: portalAction,
			effectiveAt: subscription.cancelAt ?? subscription.currentPeriodEnd,
		};
	}

	if (subscription && input.lifecycle.access === "denied") {
		return {
			kind: "subscription-inactive",
			variant: "destructive",
			action: ["incomplete", "paused", "unpaid"].includes(subscription.status) ? portalAction : "support",
			effectiveAt: subscription.endedAt ?? subscription.canceledAt,
		};
	}

	return null;
}

export function cloudBillingPath(
	organizationId: string,
	search?: { checkout?: "success" | "cancel"; returnTo?: string },
): string {
	const path = `/app/workspaces/${encodeURIComponent(organizationId)}/billing`;
	const params = new URLSearchParams();
	if (search?.checkout) params.set("checkout", search.checkout);
	if (search?.returnTo) params.set("returnTo", search.returnTo);
	return params.size > 0 ? `${path}?${params}` : path;
}

export function maximumSelectedTargets(selectedTargetsByBrand: Array<{ targetKeys: string[] }>): number {
	return selectedTargetsByBrand.reduce((maximum, selection) => Math.max(maximum, selection.targetKeys.length), 0);
}
