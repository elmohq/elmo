import { sql } from "drizzle-orm";
import { db } from "../db/db";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockOrganizationCapacity(tx: DbTransaction, organizationId: string): Promise<void> {
	await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`elmo-capacity:${organizationId}`}, 0))`);
}

/**
 * Billing projections can change capacity, so every path that needs both locks
 * takes capacity first. Keeping the ordering here prevents a webhook, billing
 * mutation, and resource write from forming a lock cycle.
 */
export async function lockOrganizationCapacityAndBilling(
	tx: DbTransaction,
	organizationId: string,
): Promise<void> {
	await lockOrganizationCapacity(tx, organizationId);
	await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`elmo-cloud-billing:${organizationId}`}, 0))`);
}
