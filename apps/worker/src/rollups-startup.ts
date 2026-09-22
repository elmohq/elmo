import { db } from "@workspace/lib/db/db";
import type { PipelineState } from "@workspace/lib/db/schema";
import { MENTIONS_ANALYSIS_KEY, MENTIONS_VERSION } from "@workspace/lib/mentions";
import {
	CLASSIFIER_VERSION,
	enqueueBackfill,
	getPipelineState,
	markAllDirty,
	ROLLUP_VERSION,
	reclassifyPages,
	setPipelineState,
} from "@workspace/lib/rollups";
import { REPROCESS_QUEUE } from "@workspace/lib/rollups/constants";
import { EXTRACTOR_VERSION } from "@workspace/lib/text-extraction";
import boss from "./boss";

// A stored version of 0 means first startup (the migration seeds 0), and
// `enqueueBackfill` already marked everything dirty, so no catch-up is needed.
async function initClassifier(state: PipelineState): Promise<void> {
	if (state.classifierVersion >= CLASSIFIER_VERSION) return;
	for (;;) {
		const updated = await reclassifyPages(db);
		if (updated === 0) break;
	}
	if (state.classifierVersion !== 0) await markAllDirty(db, "reclassify");
	await setPipelineState(db, { classifierVersion: CLASSIFIER_VERSION });
	console.log(`[rollups-startup] classifier caught up to version ${CLASSIFIER_VERSION}`);
}

async function initRollupSchema(state: PipelineState): Promise<void> {
	if (state.rollupVersion >= ROLLUP_VERSION) return;
	if (state.rollupVersion !== 0) await markAllDirty(db, "schema");
	await setPipelineState(db, { rollupVersion: ROLLUP_VERSION });
	console.log(`[rollups-startup] rollup schema caught up to version ${ROLLUP_VERSION}`);
}

async function initExtractor(state: PipelineState): Promise<void> {
	if (state.extractorVersion >= EXTRACTOR_VERSION) return;
	if (state.extractorVersion !== 0) {
		await boss.send(REPROCESS_QUEUE, { layers: ["extraction"] });
		console.log(`[rollups-startup] extractor moved to version ${EXTRACTOR_VERSION}, global reprocess requested`);
	}
	await setPipelineState(db, { extractorVersion: EXTRACTOR_VERSION });
}

/** An unrecorded version (first startup) needs no catch-up: the backfill covers it. */
async function initMentions(state: PipelineState): Promise<void> {
	const stored = state.deriverVersions[MENTIONS_ANALYSIS_KEY];
	if (stored === MENTIONS_VERSION) return;
	if (stored !== undefined) {
		await boss.send(REPROCESS_QUEUE, { layers: ["interpretation"] });
		console.log(`[rollups-startup] mentions moved to version ${MENTIONS_VERSION}, global reprocess requested`);
	}
	await setPipelineState(db, { deriverVersions: { [MENTIONS_ANALYSIS_KEY]: MENTIONS_VERSION } });
}

// Errors are left to fail startup: they mean a migration is missing.
export async function initializePipeline(): Promise<void> {
	const enqueued = await enqueueBackfill(db);
	console.log(`[rollups-startup] backfill ${enqueued ? "enqueued" : "already enqueued"}`);

	const state = await getPipelineState(db);
	await initClassifier(state);
	await initRollupSchema(state);
	await initExtractor(state);
	await initMentions(state);
	console.log("[rollups-startup] pipeline initialized");
}
