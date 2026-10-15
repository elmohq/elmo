import { db } from "@workspace/lib/db/db";
import {
	getPipelineState,
	ROLLUP_CATCH_UP_DELAY_SECONDS,
	ROLLUP_CATCH_UP_MARGIN_MS,
	ROLLUP_CATCH_UP_QUEUE,
	ROLLUP_VERSION,
	reclassifyPages,
} from "@workspace/lib/rollups";
import type { PgBoss } from "pg-boss";
import type { RollupCatchUpData } from "./jobs/rollup-catch-up";

/**
 * Brings stored rollups in line with today's code. While `ROLLUP_VERSION` is
 * ahead of the stored one, it queues the full mark (which records the new
 * version when it commits) and, an hour later, a mark of everything written
 * since, for runs from workers still on the old release. Replicas starting
 * together may each queue one; the first full mark to commit records the
 * version and the rest find nothing to do.
 */
export async function initializePipeline(boss: Pick<PgBoss, "send">): Promise<void> {
	const state = await getPipelineState(db);
	if (state.rollupVersion < ROLLUP_VERSION) {
		const rebuild: RollupCatchUpData = { since: null };
		const catchUp: RollupCatchUpData = { since: new Date(Date.now() - ROLLUP_CATCH_UP_MARGIN_MS).toISOString() };
		await boss.send(ROLLUP_CATCH_UP_QUEUE, rebuild);
		await boss.send(ROLLUP_CATCH_UP_QUEUE, catchUp, { startAfter: ROLLUP_CATCH_UP_DELAY_SECONDS });
		console.log(`[rollups-startup] rollups behind version ${ROLLUP_VERSION}; full mark and catch-up queued`);
	}

	// Pages carry the classifier version they were stamped with, so this is a
	// no-op once current and resumes where a crash left it. Reads join the page
	// rows live, so it needs no rebuild and needn't hold up startup.
	reclassifyPages(db)
		.then((updated) => {
			if (updated > 0) console.log(`[rollups-startup] reclassified ${updated} cited pages`);
		})
		.catch((error) => console.error("[rollups-startup] reclassifying cited pages failed:", error));
}
