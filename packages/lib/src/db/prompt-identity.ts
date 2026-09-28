import { type SQL, sql } from "drizzle-orm";
import { prompts } from "./schema";

/**
 * `promptIdentityKey` computed by Postgres over the stored value, so a
 * duplicate check happens in the query that holds the brand lock instead of
 * after a full read of the brand's catalog. Must stay the same function as the
 * TypeScript one: collapse every whitespace run to one space, trim, lowercase
 * (collapsing first is what makes `btrim`, which only strips spaces, match
 * JavaScript's `trim`).
 */
export function promptIdentityKeySql(column: SQL | typeof prompts.value = prompts.value): SQL<string> {
	return sql<string>`lower(btrim(regexp_replace(${column}, '\\s+', ' ', 'g')))`;
}
