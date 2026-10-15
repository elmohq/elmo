import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { getPipelineState, markRunsDirty, ROLLUP_VERSION, setPipelineState } from "@workspace/lib/rollups";
import type { Job } from "pg-boss";

export interface RollupCatchUpData {
	/** ISO instant: every bucket with a run created since then is marked. Null marks every bucket with runs. */
	since: string | null;
}

export async function runRollupCatchUp(data: RollupCatchUpData, conn: DbConnection = db): Promise<number> {
	if (data.since) {
		const marked = await markRunsDirty(conn, new Date(data.since));
		console.log(`[rollup-catch-up] marked ${marked} buckets with runs since ${data.since}`);
		return marked;
	}
	// The full mark records the version it rebuilds toward in the same commit, so
	// one that never succeeds leaves the version behind for the next startup to retry.
	return conn.transaction(async (tx) => {
		const state = await getPipelineState(tx, { forUpdate: true });
		if (state.rollupVersion >= ROLLUP_VERSION) return 0;
		const marked = await markRunsDirty(tx, null);
		await setPipelineState(tx, { rollupVersion: ROLLUP_VERSION });
		console.log(`[rollup-catch-up] rollups moving to version ${ROLLUP_VERSION}: marked ${marked} buckets`);
		return marked;
	});
}

export async function rollupCatchUpJob(jobs: Job<RollupCatchUpData>[]): Promise<void> {
	for (const job of jobs) await runRollupCatchUp(job.data);
}
