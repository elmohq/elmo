/**
 * A workspace's plan, limits, and usage, as the external surfaces publish it.
 *
 * Read-only by construction: there is no billing write anywhere in this module,
 * no billing write scope, and no tool or endpoint that could call one — so no
 * credential of any kind can change a subscription. Payment-provider
 * identifiers, invoices, and payment methods are never returned; anything a
 * customer needs to *change* lives in the provider's own portal.
 *
 * Deployments without billing answer with `billingEnabled: false`, a null plan
 * and null limits, so a caller needs no special case for self-hosting.
 */
import { planDisplayName } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { organization } from "@workspace/lib/db/schema";
import {
	countOrgAssignedPremiumSlots,
	countOrgBrands,
	countOrgEnabledPrompts,
	getOrgBillingState,
} from "@workspace/lib/entitlements";
import { eq } from "drizzle-orm";
import { getDeployment } from "@/lib/config/server";

export class OrganizationNotFoundError extends Error {
	constructor(public readonly organizationId: string) {
		super(`Organization "${organizationId}" not found.`);
		this.name = "OrganizationNotFoundError";
	}
}

/** Deciding the caller may see this workspace is the caller's job. */
export async function organizationBilling(organizationId: string) {
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.id, organizationId))
		.limit(1);
	if (!org) throw new OrganizationNotFoundError(organizationId);

	const billingEnabled = getDeployment().features.billing;
	const { entitlements, subscription } = await getOrgBillingState(organizationId);

	const [brandsUsed, promptsUsed, premiumAssigned] = await Promise.all([
		countOrgBrands(organizationId),
		countOrgEnabledPrompts(organizationId),
		countOrgAssignedPremiumSlots(organizationId),
	]);

	return {
		organizationId,
		billingEnabled,
		plan:
			billingEnabled && entitlements.planKey
				? {
						key: entitlements.planKey,
						name: planDisplayName(entitlements.planKey),
						// `standing` is ours and says the only thing a caller acts on. The
						// provider's own status string is deliberately not passed through:
						// it would make a foreign vocabulary part of this contract forever,
						// and it has no honest value for an org on a custom plan, which has
						// no subscription row.
						standing: entitlements.standing,
						trackingActive: entitlements.trackingActive,
						interval: subscription?.billingInterval ?? null,
						periodEnd: subscription?.periodEnd?.toISOString() ?? null,
						cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
					}
				: null,
		limits: billingEnabled
			? {
					maxBrands: entitlements.maxBrands,
					maxPrompts: entitlements.maxPrompts,
					// The entitlement layer says "platform"; the wire says "model", which
					// is what every other field in this API calls an answer engine.
					// Renamed here rather than in the plan config, which prices and labels
					// them for a reader who already knows the word.
					modelPicks: entitlements.platformPicks,
					modelMenu: entitlements.platformMenu,
					standardRunsPerDay: entitlements.standardRunsPerDay,
					premiumPool: entitlements.premiumPool,
					premiumRunsPerDay: entitlements.premiumRunsPerDay,
				}
			: null,
		usage: {
			brands: brandsUsed,
			enabledPrompts: promptsUsed,
			premiumPairingsAssigned: premiumAssigned,
		},
	};
}
