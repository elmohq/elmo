import { type SQL, sql } from "drizzle-orm";
import { WEB_QUERIES_UNAVAILABLE } from "../constants";

/**
 * A web query the way fan-out counts it, so casing and stray whitespace don't
 * split one query in two. Trims tabs and newlines too, as the dashboard does.
 */
export const normalizedWebQuery = (query: SQL): SQL =>
	sql`lower(regexp_replace(${query}, '^[[:space:]]+|[[:space:]]+$', '', 'g'))`;

/**
 * Excludes the prompt searched verbatim as a display rule: a repeat says nothing
 * about how it was rewritten. Compared against the prompt's current text, so
 * DataForSEO rows from before 2026-06, which echoed the prompt, surface after an edit.
 */
export function isFanoutQuery(query: SQL, promptText: SQL): SQL {
	const normalized = normalizedWebQuery(query);
	return sql`length(${normalized}) > 0
		AND ${normalized} <> ${WEB_QUERIES_UNAVAILABLE}
		AND ${normalized} <> ${normalizedWebQuery(promptText)}`;
}
