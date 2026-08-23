/**
 * How much of a site the llms.txt generator will read. Deliberately modest: the
 * output is a starting file a human edits, and every extra page is another
 * request we make to someone else's server on a stranger's say-so.
 *
 * Shared with the browser, which batches its own requests to match.
 */
export const MAX_PAGES = 60;
export const MAX_SITEMAPS = 4;
/** Pages per describePages call — small enough that no single request runs long. */
export const SUMMARY_BATCH_SIZE = 12;
