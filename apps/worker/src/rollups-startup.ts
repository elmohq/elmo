import { db } from "@workspace/lib/db/db";
import type { PipelineState } from "@workspace/lib/db/schema";
import { DERIVERS } from "@workspace/lib/derivers";
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

/**
 * `state.X === 0` means this is the first startup since the rollups feature
 * was deployed (the migration seeds every version at 0), regardless of how
 * much history is already in `prompt_runs`. `enqueueBackfill` already marked
 * all of it dirty, so the version-specific catch-up work below only needs to
 * run for brands that were already initialized under an older version.
 */
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

/**
 * A deriver missing from `state.deriverVersions` (brand new install, or a
 * brand new deriver on an existing one) needs no retroactive fix: there is
 * nothing yet that depended on it. Only a version bump on a deriver already on
 * record is worth a global reprocess.
 */
async function initDerivers(state: PipelineState): Promise<void> {
	const nextVersions: Record<string, number> = {};
	for (const deriver of DERIVERS) {
		const stored = state.deriverVersions[deriver.name];
		if (stored !== undefined && stored !== deriver.version) {
			await boss.send(REPROCESS_QUEUE, { layers: ["interpretation"], derivers: [deriver.name] });
			console.log(
				`[rollups-startup] deriver "${deriver.name}" moved to version ${deriver.version}, reprocess requested`,
			);
		}
		nextVersions[deriver.name] = deriver.version;
	}
	await setPipelineState(db, { deriverVersions: nextVersions });
}

/**
 * Brings the stored data's version stamps in line with what today's code
 * produces, enqueueing whatever catch-up work the gap requires. Called once at
 * worker startup, after queues exist (the reprocess sends below need
 * `REPROCESS_QUEUE` to already be created) and before job handlers register.
 * Errors here are left to fail startup: they mean a migration is missing.
 */
export async function initializePipeline(): Promise<void> {
	const enqueued = await enqueueBackfill(db);
	console.log(`[rollups-startup] backfill ${enqueued ? "enqueued" : "already enqueued"}`);

	const state = await getPipelineState(db);
	await initClassifier(state);
	await initRollupSchema(state);
	await initExtractor(state);
	await initDerivers(state);
	console.log("[rollups-startup] pipeline initialized");
}
