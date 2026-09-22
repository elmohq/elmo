export const BUCKET_MINUTES = 30;
export const BUCKET_MS = BUCKET_MINUTES * 60 * 1000;

/**
 * Bumped when the rollup tables gain a measure or dimension, or when the code
 * that fills them changes what it stores. The worker compares these to
 * `pipeline_state` on startup and enqueues the work that closes the gap.
 */
export const ROLLUP_VERSION = 1;
/** Bumped when the curated domain lists or the URL classifier change. */
export const CLASSIFIER_VERSION = 1;

export const REFRESH_ROLLUPS_QUEUE = "refresh-rollups";
export const REPROCESS_QUEUE = "reprocess";
export const RECONCILE_ROLLUPS_QUEUE = "reconcile-rollups";

/** Shared by web and worker: whichever starts first creates the queue, and sends to a missing queue fail. */
export const ROLLUP_QUEUE_OPTIONS = {
	[REFRESH_ROLLUPS_QUEUE]: { retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: 60 * 5 },
	[REPROCESS_QUEUE]: { retryLimit: 2, retryDelay: 60, retryBackoff: true, expireInSeconds: 60 * 10 },
	[RECONCILE_ROLLUPS_QUEUE]: { retryLimit: 1, retryDelay: 300, expireInSeconds: 60 * 30 },
};

export type DirtyReason = "run" | "reprocess" | "backfill" | "reconcile" | "reclassify" | "schema";
