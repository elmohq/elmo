/** Width of the UTC bucket every rollup table is keyed by. */
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

export type DirtyReason = "run" | "reprocess" | "backfill" | "reconcile" | "reclassify" | "schema";
