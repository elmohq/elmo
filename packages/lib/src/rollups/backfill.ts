import { eq, sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { rollupDirty } from "../db/schema";
import { markAllDirty } from "./dirty";
import { getPipelineState, setPipelineState } from "./pipeline-state";

/** The marks are the whole cursor: a crash mid-backfill leaves the remaining work queued. */
export function enqueueBackfill(conn: DbConnection): Promise<boolean> {
	return conn.transaction(async (tx) => {
		const state = await getPipelineState(tx, { forUpdate: true });
		if (state.backfillEnqueuedAt) return false;
		await markAllDirty(tx, "backfill");
		await setPipelineState(tx, { backfillEnqueuedAt: new Date() });
		return true;
	});
}

export function finishBackfillIfDrained(conn: DbConnection): Promise<boolean> {
	return conn.transaction(async (tx) => {
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

export async function rollupsReady(conn: DbConnection): Promise<boolean> {
	return (await getPipelineState(conn)).backfillCompletedAt !== null;
}
