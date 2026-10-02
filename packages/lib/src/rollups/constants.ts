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

/**
 * Workers still on the previous version keep writing runs, without marks, until
 * the deploy finishes rolling out. The catch-up re-marks everything written since
 * the full rebuild was requested, once those workers are surely gone.
 */
export const ROLLUP_CATCH_UP_DELAY_SECONDS = 60 * 60;
/** Reaches back past the rebuild request to cover runs whose transaction began before it. */
export const ROLLUP_CATCH_UP_MARGIN_MS = 60 * 60 * 1000;

export const REFRESH_ROLLUPS_QUEUE = "refresh-rollups";
export const ROLLUP_CATCH_UP_QUEUE = "rollup-catch-up";

export type DirtyReason = "run" | "reprocess" | "backfill" | "schema" | "catch-up";
