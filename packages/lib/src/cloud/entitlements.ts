import {
	type CloudSubscriptionEntitlementSnapshot,
	type ResolvedEntitlements,
	resolveEntitlements,
} from "@workspace/config/entitlements";
import type { DeploymentMode } from "@workspace/config/types";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "../db/db";
import {
	organizationBillingSubscriptionItems,
	organizationBillingMutations,
	organizationBillingSubscriptions,
	organizationEntitlementOverrides,
} from "../db/schema";

export interface OrganizationBillingSnapshotStore {
	load(organizationId: string, now: Date): Promise<CloudSubscriptionEntitlementSnapshot | null>;
}

type DbConnection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export function createOrganizationBillingSnapshotStore(conn: DbConnection = db): OrganizationBillingSnapshotStore {
	return {
		async load(organizationId, now) {
			const [subscription] = await conn
				.select({
					planId: organizationBillingSubscriptions.basePlanKey,
					status: organizationBillingSubscriptions.status,
				})
				.from(organizationBillingSubscriptions)
				.where(eq(organizationBillingSubscriptions.organizationId, organizationId))
				.limit(1);
			if (!subscription?.planId) return null;

			const [premiumItem] = await conn
				.select({ quantity: organizationBillingSubscriptionItems.quantity })
				.from(organizationBillingSubscriptionItems)
				.where(
					and(
						eq(organizationBillingSubscriptionItems.organizationId, organizationId),
						eq(organizationBillingSubscriptionItems.type, "premium_addon"),
						eq(organizationBillingSubscriptionItems.active, true),
					),
				)
				.limit(1);

			const [override] = await conn
				.select({
					schemaVersion: organizationEntitlementOverrides.schemaVersion,
					entitlements: organizationEntitlementOverrides.entitlements,
				})
				.from(organizationEntitlementOverrides)
				.where(
					and(
						eq(organizationEntitlementOverrides.organizationId, organizationId),
						lte(organizationEntitlementOverrides.effectiveFrom, now),
						or(isNull(organizationEntitlementOverrides.revokedAt), gt(organizationEntitlementOverrides.revokedAt, now)),
						or(
							isNull(organizationEntitlementOverrides.effectiveUntil),
							gt(organizationEntitlementOverrides.effectiveUntil, now),
						),
					),
				)
				.orderBy(desc(organizationEntitlementOverrides.revision))
				.limit(1);
			// Read the fence last. A concurrent command can only become visible
			// after all source rows above were read, never between a fence read and
			// an older subscription snapshot that would accidentally grant access.
			const [pendingMutation] = await conn
				.select({ id: organizationBillingMutations.id })
				.from(organizationBillingMutations)
				.where(
					and(
						eq(organizationBillingMutations.organizationId, organizationId),
						eq(organizationBillingMutations.status, "pending"),
					),
				)
				.limit(1);

			return {
				planId: subscription.planId,
				status: subscription.status,
				billingMutationPending: pendingMutation !== undefined,
				claudeAddonPromptSlots: premiumItem?.quantity ?? 0,
				entitlementOverride: override
					? { version: override.schemaVersion, entitlements: override.entitlements }
					: undefined,
			};
		},
	};
}

export async function resolveOrganizationEntitlements(input: {
	mode: DeploymentMode;
	organizationId: string;
	now?: Date;
	store?: OrganizationBillingSnapshotStore;
}): Promise<ResolvedEntitlements> {
	if (input.mode !== "cloud") return resolveEntitlements({ mode: input.mode });

	const store = input.store ?? createOrganizationBillingSnapshotStore();
	const subscription = await store.load(input.organizationId, input.now ?? new Date());
	return resolveEntitlements({ mode: "cloud", subscription });
}
