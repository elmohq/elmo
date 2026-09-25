import { type SQL, sql } from "drizzle-orm";

/**
 * Stemmed, so a search for "recommend" also finds "recommended". The stored
 * vector and every query against it must use the same configuration, or
 * matches silently disappear.
 */
const SEARCH_CONFIG = "english";

/** Postgres text cannot hold NUL, and one stray byte from a provider would fail the whole write. */
export function storableResponseText(text: string): string {
	return text.replaceAll("\u0000", "");
}

export function responseSearchVector(text: string | SQL): SQL {
	return sql`to_tsvector(${SEARCH_CONFIG}::regconfig, ${text})`;
}

/** Accepts what people type into a search box: "quoted phrases", `or`, and `-excluded` words. */
export function responseSearchQuery(query: string): SQL {
	return sql`websearch_to_tsquery(${SEARCH_CONFIG}::regconfig, ${query})`;
}

export function responseSearchHeadline(text: SQL, query: string, options: string): SQL {
	return sql`ts_headline(${SEARCH_CONFIG}::regconfig, ${text}, ${responseSearchQuery(query)}, ${options})`;
}
