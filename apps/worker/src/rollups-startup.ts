import { db } from "@workspace/lib/db/db";
import {
	CLASSIFIER_VERSION,
	enqueueBackfill,
	getPipelineState,
	markAllDirty,
	ROLLUP_VERSION,
	reclassifyPages,
	setPipelineState,
} from "@workspace/lib/rollups";

/**
 * Brings stored rollups in line with today's code. The state row stays locked
 * throughout, so replicas starting together don't each redo the catch-up.
 * Errors are left to fail startup: they mean a migration is missing.
 */
export function initializePipeline(): Promise<void> {
	return db.transaction(async (tx) => {
		const state = await getPipelineState(tx, { forUpdate: true });
		if (await enqueueBackfill(tx)) {
			console.log("[rollups-startup] backfill enqueued");
		} else if (state.rollupVersion < ROLLUP_VERSION) {
			await markAllDirty(tx, "schema");
			console.log(`[rollups-startup] rollups moved to version ${ROLLUP_VERSION}, full rebuild requested`);
		}
		if (state.classifierVersion < CLASSIFIER_VERSION) {
			const updated = await reclassifyPages(tx);
			console.log(`[rollups-startup] classifier moved to version ${CLASSIFIER_VERSION}, ${updated} pages reclassified`);
		}
		await setPipelineState(tx, { rollupVersion: ROLLUP_VERSION, classifierVersion: CLASSIFIER_VERSION });
	});
}
