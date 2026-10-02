import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { markRunsSinceDirty } from "@workspace/lib/rollups";
import type { Job } from "pg-boss";

export interface RollupCatchUpData {
	/** ISO instant; every bucket with a run created since then is marked. */
	since: string;
}

export async function runRollupCatchUp(data: RollupCatchUpData, conn: DbConnection = db): Promise<number> {
	const marked = await markRunsSinceDirty(conn, new Date(data.since), "catch-up");
	console.log(`[rollup-catch-up] marked ${marked} buckets with runs since ${data.since}`);
	return marked;
}

export async function rollupCatchUpJob(jobs: Job<RollupCatchUpData>[]): Promise<void> {
	for (const job of jobs) await runRollupCatchUp(job.data);
}
