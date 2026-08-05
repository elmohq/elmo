import { sql } from "drizzle-orm";
import type { db } from "../db/db";
import { organizationEntitlementReconciliations } from "../db/schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Marks an organization dirty without postponing an already-earlier boundary. */
export async function markOrganizationEntitlementReconciliationDue(input: {
	tx: DbTransaction;
	organizationId: string;
	reconcileAfter?: Date;
}): Promise<void> {
	const reconcileAfter = input.reconcileAfter ?? new Date();
	await input.tx
		.insert(organizationEntitlementReconciliations)
		.values({ organizationId: input.organizationId, reconcileAfter })
		.onConflictDoUpdate({
			target: organizationEntitlementReconciliations.organizationId,
			set: {
				reconcileAfter: sql`CASE
					WHEN ${organizationEntitlementReconciliations.reconcileAfter} IS NULL
						OR ${organizationEntitlementReconciliations.reconcileAfter} > excluded.reconcile_after
					THEN excluded.reconcile_after
					ELSE ${organizationEntitlementReconciliations.reconcileAfter}
				END`,
				updatedAt: reconcileAfter,
			},
		});
}
