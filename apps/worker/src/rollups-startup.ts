import { db } from "@workspace/lib/db/db";
import {
	getPipelineState,
	markAllDirty,
	ROLLUP_CATCH_UP_DELAY_SECONDS,
	ROLLUP_CATCH_UP_MARGIN_MS,
	ROLLUP_CATCH_UP_QUEUE,
	ROLLUP_VERSION,
	reclassifyPages,
	setPipelineState,
} from "@workspace/lib/rollups";
import type { PgBoss } from "pg-boss";
import type { RollupCatchUpData } from "./jobs/rollup-catch-up";

/**
 * Brings stored rollups in line with today's code. The state row stays locked
 * throughout, so replicas starting together don't each redo the catch-up.
 * Errors are left to fail startup: they mean a migration is missing.
 *
 * A version change marks every bucket that has runs; the refresh job drains
 * them newest first. The catch-up job is sent before the commit, so a crash in
 * between costs at most a redundant re-mark, never a missed one.
 */
export async function initializePipeline(boss: Pick<PgBoss, "send">): Promise<void> {
	await db.transaction(async (tx) => {
		const state = await getPipelineState(tx, { forUpdate: true });
		if (state.rollupVersion >= ROLLUP_VERSION) return;
		const since = new Date(Date.now() - ROLLUP_CATCH_UP_MARGIN_MS);
		const marked = await markAllDirty(tx);
		const data: RollupCatchUpData = { since: since.toISOString() };
		await boss.send(ROLLUP_CATCH_UP_QUEUE, data, { startAfter: ROLLUP_CATCH_UP_DELAY_SECONDS });
		await setPipelineState(tx, { rollupVersion: ROLLUP_VERSION });
		console.log(
			`[rollups-startup] rollups moved to version ${ROLLUP_VERSION}: ${marked} buckets marked, catch-up in ${ROLLUP_CATCH_UP_DELAY_SECONDS}s`,
		);
	});

	// Pages carry the classifier version they were stamped with, so this is a
	// no-op once current and resumes where a crash left it. Reads join the page
	// rows live, so it needs no rebuild and needn't hold up startup.
	reclassifyPages(db)
		.then((updated) => {
			if (updated > 0) console.log(`[rollups-startup] reclassified ${updated} cited pages`);
		})
		.catch((error) => console.error("[rollups-startup] reclassifying cited pages failed:", error));
}
