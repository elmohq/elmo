/**
 * Billing server functions (cloud mode). Read paths power the paywall, the
 * plan picker, and the billing settings page; the single write path adjusts
 * the extra-Claude-prompts add-on quantity. Checkout, plan changes, portal,
 * and cancellation all go through better-auth's Stripe endpoints client-side —
 * no custom payment surface here.
 */
import { createServerFn } from "@tanstack/react-start";
import { setClaudeAddonQuantity } from "@workspace/cloud/billing";
import type { Entitlements } from "@workspace/config/entitlements";
import { isClaudeAddonAvailable } from "@workspace/config/plans";
import {
	countOrgAssignedClaudePrompts,
	countOrgBrands,
	countOrgEnabledPrompts,
	getOrgBillingState,
	getOrgEntitlementsMap,
} from "@workspace/lib/entitlements";
import { z } from "zod";
import { listUserOrganizations, requireAuthSession, requireBrandOrganization } from "@/lib/auth/helpers";
import { isOrgAdminRole } from "@/lib/auth/policies";
import { getDeployment } from "@/lib/config/server";

export type BillingState = {
	billingEnabled: boolean;
	organization: { id: string; name: string; role: string };
	entitlements: Entitlements;
	subscription: {
		id: string;
		plan: string;
		status: string;
		periodEnd: string | null;
		cancelAtPeriodEnd: boolean;
		billingInterval: string | null;
		seats: number | null;
	} | null;
	claudeAddonQuantity: number;
	claudeAddonAvailable: boolean;
	usage: { brands: number; enabledPrompts: number; claudeAssigned: number };
};

export type PaywallRequired = {
	needsPlan: true;
	organizationId: string;
	organizationName: string;
	isOrgAdmin: boolean;
};

export type PaywallState = { needsPlan: false } | PaywallRequired;

export const getBillingStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<BillingState> => {
		const session = await requireAuthSession();
		const org = await requireBrandOrganization(session.user.id, data.brandId);
		const deployment = getDeployment();

		const state = await getOrgBillingState(org.id);
		const [brandsUsed, promptsUsed, claudeAssigned] = state.entitlements.unlimited
			? [0, 0, 0]
			: await Promise.all([
					countOrgBrands(org.id),
					countOrgEnabledPrompts(org.id),
					countOrgAssignedClaudePrompts(org.id),
				]);

		return {
			billingEnabled: deployment.features.billing,
			organization: org,
			entitlements: state.entitlements,
			subscription: state.subscription
				? {
						id: state.subscription.id,
						plan: state.subscription.plan,
						status: state.subscription.status ?? "incomplete",
						periodEnd: state.subscription.periodEnd?.toISOString() ?? null,
						cancelAtPeriodEnd: state.subscription.cancelAtPeriodEnd ?? false,
						billingInterval: state.subscription.billingInterval ?? null,
						seats: state.subscription.seats ?? null,
					}
				: null,
			claudeAddonQuantity: state.settings?.claudeAddonQuantity ?? 0,
			claudeAddonAvailable: isClaudeAddonAvailable(state.entitlements.planKey),
			usage: { brands: brandsUsed, enabledPrompts: promptsUsed, claudeAssigned },
		};
	});

/**
 * The paywall decision for a signed-in user. Outside cloud (or with any
 * entitled org) nothing is required. Checks all orgs the user belongs to:
 * if every org has "none" standing, the user needs a plan.
 */
export const getPaywallStateFn = createServerFn({ method: "GET" })
	.handler(async (): Promise<PaywallState> => {
		const deployment = getDeployment();
		if (!deployment.features.billing) return { needsPlan: false };

		const session = await requireAuthSession();
		const orgs = await listUserOrganizations(session.user.id);
		if (orgs.length === 0) return { needsPlan: false };

		// Any entitled org (e.g. a team they joined) keeps the app usable.
		const entitlementsByOrg = await getOrgEntitlementsMap(orgs.map((org) => org.id));
		if (orgs.some((org) => entitlementsByOrg.get(org.id)?.standing !== "none")) {
			return { needsPlan: false };
		}

		// listUserOrganizations is oldest-first, so this is the user's own workspace.
		const own = orgs[0];
		return {
			needsPlan: true,
			organizationId: own.id,
			organizationName: own.name,
			isOrgAdmin: isOrgAdminRole(own.role),
		};
	});

export const setClaudeAddonQuantityFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), quantity: z.number().int().min(0).max(1000) }))
	.handler(async ({ data }) => {
		const deployment = getDeployment();
		if (!deployment.features.billing) throw new Error("Billing is not enabled on this deployment");

		const session = await requireAuthSession();
		const org = await requireBrandOrganization(session.user.id, data.brandId);
		if (!isOrgAdminRole(org.role)) {
			throw new Error("Only workspace admins can change billing");
		}

		const state = await getOrgBillingState(org.id);
		if (!isClaudeAddonAvailable(state.entitlements.planKey)) {
			throw new Error("Extra Claude prompts are available on the Pro and Business plans");
		}
		if (!state.subscription?.stripeSubscriptionId) {
			throw new Error("No active subscription to attach the add-on to");
		}

		// Shrinking the add-on below what's assigned would orphan assignments;
		// the worker would stop running the newest ones. Require unassigning first.
		const included = state.entitlements.claudePool - (state.settings?.claudeAddonQuantity ?? 0);
		const assigned = await countOrgAssignedClaudePrompts(org.id);
		if (assigned > included + data.quantity) {
			throw new Error(
				`${assigned} prompts have Claude tracking assigned; unassign ${assigned - included - data.quantity} before reducing the add-on`,
			);
		}

		const quantity = await setClaudeAddonQuantity({
			stripeSubscriptionId: state.subscription.stripeSubscriptionId,
			organizationId: org.id,
			quantity: data.quantity,
		});
		return { quantity };
	});
