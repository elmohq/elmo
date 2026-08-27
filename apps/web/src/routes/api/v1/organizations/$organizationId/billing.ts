/**
 * GET /api/v1/organizations/:organizationId/billing — plan, limits, usage.
 *
 * Read-only by construction: there is no billing write endpoint and no billing
 * write scope, so no key of any kind can change a subscription, an add-on
 * quantity, or a payment method. Payment-provider identifiers, invoices, and
 * payment methods are never returned — anything a customer needs to *change*
 * lives in the provider's own portal.
 *
 * Deployments without billing answer 200 with `billingEnabled: false`, a null
 * plan and null limits, so a caller needs no special case for self-hosting.
 */
import { createFileRoute } from "@tanstack/react-router";
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
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireOrganizationInScope } from "@/lib/api/scope";
import { getDeployment } from "@/lib/config/server";

export const Route = createFileRoute("/api/v1/organizations/$organizationId/billing")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["billing:read"],
				handle: async ({ params, auth }) => {
					const { organizationId } = params;
					requireOrganizationInScope(auth, organizationId);
					const [org] = await db
						.select({ id: organization.id })
						.from(organization)
						.where(eq(organization.id, organizationId))
						.limit(1);
					if (!org) {
						throw new ApiError(404, "Not Found", `Organization "${organizationId}" not found.`);
					}

					const billingEnabled = getDeployment().features.billing;
					const state = await getOrgBillingState(organizationId);
					const { entitlements, subscription } = state;

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
										// `standing` is ours and says the only thing a caller acts
										// on. The provider's own status string is deliberately not
										// passed through: it would make a foreign vocabulary part
										// of this contract forever, and it has no honest value for
										// an org on a custom plan, which has no subscription row.
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
									platformPicks: entitlements.platformPicks,
									platformMenu: entitlements.platformMenu,
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
				},
			}),
		}),
	},
});
