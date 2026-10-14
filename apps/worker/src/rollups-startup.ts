import { db } from "@workspace/lib/db/db";
import {
	getPipelineState,
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
 * Brings stored rollups in line with today's code. When `ROLLUP_VERSION` moves,
 * it queues a mark of every bucket with runs (the refresh then rebuilds them,
 * newest first) and, an hour later, a second mark of everything written since,
 * for runs from workers still on the old release. The state row stays locked
 * meanwhile, so replicas starting together queue that once; the jobs are sent
 * before the commit, so a crash costs at most a redundant mark.
 */
export async function initializePipeline(boss: Pick<PgBoss, "send">): Promise<void> {
	await db.transaction(async (tx) => {
		const state = await getPipelineState(tx, { forUpdate: true });
		if (state.rollupVersion >= ROLLUP_VERSION) return;
		const rebuild: RollupCatchUpData = { since: null };
		const catchUp: RollupCatchUpData = { since: new Date(Date.now() - ROLLUP_CATCH_UP_MARGIN_MS).toISOString() };
		await boss.send(ROLLUP_CATCH_UP_QUEUE, rebuild);
		await boss.send(ROLLUP_CATCH_UP_QUEUE, catchUp, { startAfter: ROLLUP_CATCH_UP_DELAY_SECONDS });
		await setPipelineState(tx, { rollupVersion: ROLLUP_VERSION });
		console.log(`[rollups-startup] rollups moved to version ${ROLLUP_VERSION}; rebuild and catch-up queued`);
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
