import { type SQL, sql } from "drizzle-orm";
import { WEB_QUERIES_UNAVAILABLE } from "../constants";

/** A web query the way fan-out counts it, so casing and stray spaces don't split one query in two. */
export const normalizedWebQuery = (query: SQL): SQL => sql`lower(btrim(${query}))`;

/**
 * Genuine fan-out: non-empty, not the `unavailable` sentinel, and not the prompt
 * searched verbatim. The verbatim rule is a display rule, not data cleaning:
 * engines do search the prompt as written, but a repeat says nothing about how
 * the prompt was rewritten. It compares against the prompt's current text, so
 * editing a prompt's text re-marks its buckets and searches of the old wording
 * start counting: real searches for honest providers, though DataForSEO rows from
 * before 2026-06 (which echoed the prompt as their query) would surface searches
 * that never ran until they age out of the lookback windows.
 */
export function isFanoutQuery(query: SQL, promptText: SQL): SQL {
	const normalized = normalizedWebQuery(query);
	return sql`length(${normalized}) > 0
		AND ${normalized} <> ${WEB_QUERIES_UNAVAILABLE}
		AND ${normalized} <> ${normalizedWebQuery(promptText)}`;
}
