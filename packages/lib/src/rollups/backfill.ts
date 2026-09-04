import { eq, sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { rollupDirty } from "../db/schema";
import { markAllDirty } from "./dirty";
import { getPipelineState, setPipelineState } from "./pipeline-state";
import { inTransaction } from "./transaction";

/**
 * Marks every bucket that has ever had a run, once per deployment. The marks are
 * the whole cursor: a crash mid-backfill leaves the remaining work queued.
 * Returns false when a backfill was already enqueued.
 */
export function enqueueBackfill(conn: DbConnection): Promise<boolean> {
	return inTransaction(conn, async (tx) => {
		const state = await getPipelineState(tx, { forUpdate: true });
		if (state.backfillEnqueuedAt) return false;
		await markAllDirty(tx, "backfill");
		await setPipelineState(tx, { backfillEnqueuedAt: new Date() });
		return true;
	});
}

/** Stamps the backfill complete once its last mark has been drained. */
export function finishBackfillIfDrained(conn: DbConnection): Promise<boolean> {
	return inTransaction(conn, async (tx) => {
		const state = await getPipelineState(tx, { forUpdate: true });
		if (state.backfillCompletedAt || !state.backfillEnqueuedAt) return false;
		const [remaining] = await tx
			.select({ exists: sql<number>`1` })
			.from(rollupDirty)
			.where(eq(rollupDirty.reason, "backfill"))
			.limit(1);
		if (remaining) return false;
		await setPipelineState(tx, { backfillCompletedAt: new Date() });
		return true;
	});
}

/** Whether the rollup tables cover all of history and reads may trust them. */
export async function rollupsReady(conn: DbConnection): Promise<boolean> {
	return (await getPipelineState(conn)).backfillCompletedAt !== null;
}
