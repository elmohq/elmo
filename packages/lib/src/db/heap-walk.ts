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

/** A walk that started with the heap `end` pages long and has pages [0, next) left. */
export interface HeapWalkPosition {
	end: number;
	next: number;
}

export interface HeapWalkOptions {
	/** Resumes a walk where it got to. */
	from?: HeapWalkPosition | null;
	/** After each window: where the walk has got to and how many rows the window changed. */
	onStep?: (position: HeapWalkPosition, changed: number) => Promise<void>;
}

/**
 * Visits a table's heap a window of pages at a time, last page first: each
 * window is one sequential read, and rows are mostly appended, so the newest
 * come first. Backfills over tables too big for memory walk this way rather than
 * by an index, which turns every row into a random read.
 *
 * Pages added since the walk started are walked again until a pass finds
 * nothing to do; `visit` returns how many rows it changed.
 */
export async function walkHeap(
	conn: DbConnection,
	table: PgTable,
	pagesPerStep: number,
	visit: (from: number, to: number) => Promise<number>,
	options: HeapWalkOptions = {},
): Promise<number> {
	const walkDown = async (from: number, to: number, end: number) => {
		let changed = 0;
		for (let top = to; top > from; top -= pagesPerStep) {
			const bottom = Math.max(from, top - pagesPerStep);
			const step = await visit(bottom, top);
			changed += step;
			await options.onStep?.({ end, next: from === 0 ? bottom : 0 }, step);
		}
		return changed;
	};

	const end = options.from?.end ?? (await pageCount(conn, table));
	let total = await walkDown(0, options.from?.next ?? end, end);
	let walkedTo = end;
	for (;;) {
		const grownTo = await pageCount(conn, table);
		if (grownTo <= walkedTo) return total;
		const changed = await walkDown(walkedTo, grownTo, end);
		total += changed;
		walkedTo = grownTo;
		if (changed === 0) return total;
	}
}
