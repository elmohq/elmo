import type { ResolvedEntitlements } from "@workspace/config/entitlements";
import type { db } from "../db/db";
import { brandSchedulerRollouts, brandTargetSelections } from "../db/schema";
import { markOrganizationEntitlementReconciliationDue } from "./entitlement-reconciliation-cursor";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AllowedCloudEntitlements = Extract<ResolvedEntitlements, { mode: "cloud"; access: "allowed" }>;

export async function initializeDefaultBrandTracking(input: {
	tx: DbTransaction;
	resolved: AllowedCloudEntitlements;
	organizationId: string;
	brandId: string;
	createdByUserId?: string;
	now?: Date;
}): Promise<void> {
	const targetDefinition = input.resolved.entitlements.trackingTargets;
	const defaults =
		targetDefinition.mode === "fixed"
			? targetDefinition.targets
			: targetDefinition.targets.slice(0, targetDefinition.minimumSelected);
	if (defaults.length > 0) {
		await input.tx
			.insert(brandTargetSelections)
			.values(
				defaults.map((target) => ({
					brandId: input.brandId,
					targetKey: target.targetKey,
					requestedCadenceMinutes: null,
					source: "plan_default" as const,
					createdByUserId: input.createdByUserId,
				})),
			)
			.onConflictDoNothing({ target: [brandTargetSelections.brandId, brandTargetSelections.targetKey] });
	}
	const now = input.now ?? new Date();
	await input.tx
		.insert(brandSchedulerRollouts)
		.values({ brandId: input.brandId, mode: "v2", generation: 1, cutoverAt: now })
		.onConflictDoNothing({ target: brandSchedulerRollouts.brandId });
	await markOrganizationEntitlementReconciliationDue({
		tx: input.tx,
		organizationId: input.organizationId,
		reconcileAfter: now,
	});
}
