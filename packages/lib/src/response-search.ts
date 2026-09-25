import { type SQL, sql } from "drizzle-orm";
import { isExtractionPlaceholder } from "./text-extraction";

/**
 * Stemmed, so a search for "recommend" also finds "recommended". The stored
 * vector and every query against it must use the same configuration, or
 * matches silently disappear.
 */
const SEARCH_CONFIG = "english";

/**
 * What gets indexed for an extracted answer: nothing when there was no answer,
 * so a search never matches the placeholder shown in its place. Postgres text
 * cannot hold NUL, and one stray byte from a provider would fail the whole write.
 */
export function storableResponseText(text: string): string {
	return isExtractionPlaceholder(text) ? "" : text.replaceAll("\u0000", "");
}

export function responseSearchVector(text: string | SQL): SQL {
	return sql`to_tsvector(${SEARCH_CONFIG}::regconfig, ${text})`;
}

/** Accepts what people type into a search box: "quoted phrases", `or`, and `-excluded` words. */
export function responseSearchQuery(query: string): SQL {
	return sql`websearch_to_tsquery(${SEARCH_CONFIG}::regconfig, ${query})`;
}
