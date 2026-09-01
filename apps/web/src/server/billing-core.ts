/**
 * Read-only by construction: no billing write exists here, no scope grants one,
 * and no provider identifiers are returned. A deployment without billing
 * answers `billingEnabled: false` rather than erroring.
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
						// The provider's own status is not passed through: it would make a
						// foreign vocabulary part of this contract, and a custom plan has
						// no subscription row to read it from.
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
					// The entitlement layer says "platform"; the wire says "model".
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
