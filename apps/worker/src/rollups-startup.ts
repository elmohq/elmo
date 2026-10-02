import { db } from "@workspace/lib/db/db";
import {
	CLASSIFIER_VERSION,
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
export function initializePipeline(boss: Pick<PgBoss, "send">): Promise<void> {
	return db.transaction(async (tx) => {
		const state = await getPipelineState(tx, { forUpdate: true });
		if (state.rollupVersion < ROLLUP_VERSION) {
			const since = new Date(Date.now() - ROLLUP_CATCH_UP_MARGIN_MS);
			const marked = await markAllDirty(tx, state.rollupVersion === 0 ? "backfill" : "schema");
			const data: RollupCatchUpData = { since: since.toISOString() };
			await boss.send(ROLLUP_CATCH_UP_QUEUE, data, { startAfter: ROLLUP_CATCH_UP_DELAY_SECONDS });
			console.log(
				`[rollups-startup] rollups moved to version ${ROLLUP_VERSION}: ${marked} buckets marked, catch-up in ${ROLLUP_CATCH_UP_DELAY_SECONDS}s`,
			);
		}
		if (state.classifierVersion < CLASSIFIER_VERSION) {
			const updated = await reclassifyPages(tx);
			console.log(`[rollups-startup] classifier moved to version ${CLASSIFIER_VERSION}, ${updated} pages reclassified`);
		}
		await setPipelineState(tx, { rollupVersion: ROLLUP_VERSION, classifierVersion: CLASSIFIER_VERSION });
	});
}
