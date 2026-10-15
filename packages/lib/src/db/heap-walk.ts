import { getTableName, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { DbConnection } from "./db-connection";

async function pageCount(conn: DbConnection, table: PgTable): Promise<number> {
	const result = await conn.execute<{ pages: string }>(
		sql`SELECT (pg_relation_size(${getTableName(table)}::regclass) / current_setting('block_size')::int)::bigint AS pages`,
	);
	return Number(result.rows[0]?.pages ?? 0);
}

/** Rows of `ctid` (a table's qualified ctid column) on heap pages [from, to). */
export function onPages(ctid: SQL, from: number, to: number): SQL {
	return sql`${ctid} >= ${`(${from},0)`}::tid AND ${ctid} < ${`(${to},0)`}::tid`;
}

/**
 * Visits a table's heap a window of pages at a time, last page first: each
 * window is one sequential read, and rows are mostly appended, so the newest
 * come first. Backfills over tables too big for memory walk this way rather than
 * by an index, which turns every row into a random read.
 *
 * Pages added during a pass are walked by another, until one finds nothing to
 * do; `visit` returns how many rows it changed.
 */
export async function walkHeap(
	conn: DbConnection,
	table: PgTable,
	pagesPerStep: number,
	visit: (from: number, to: number) => Promise<number>,
): Promise<number> {
	let total = 0;
	let walkedFrom = 0;
	let end = await pageCount(conn, table);
	for (;;) {
		let changed = 0;
		for (let to = end; to > walkedFrom; to -= pagesPerStep) {
			changed += await visit(Math.max(walkedFrom, to - pagesPerStep), to);
		}
		total += changed;
		const grownTo = await pageCount(conn, table);
		if (walkedFrom > 0 && changed === 0) return total;
		if (grownTo <= end) return total;
		walkedFrom = end;
		end = grownTo;
	}
}
