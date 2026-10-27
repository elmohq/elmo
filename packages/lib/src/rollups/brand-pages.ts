import { sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { citedPageChanges, citedPages, pipelineState, rollupCitationPages, rollupCitationUrls } from "../db/schema";
import { chunked } from "./chunk";

/**
 * Longer than any transaction that stamps a change or adds a copy takes to
 * commit, so one that commits after a sync began is still caught by the next.
 */
const SYNC_MARGIN = sql.raw(`interval '10 minutes'`);

/** How far back the first sync after the copies were introduced looks for what it missed while they were. */
const FIRST_SYNC_LOOKBACK = sql.raw(`interval '2 days'`);

const copyColumns = (table: string) =>
	sql.raw(`(${table}.url, ${table}.domain, ${table}.title, ${table}.page_type, ${table}.static_category)`);

async function syncPages(conn: DbConnection, pageIds: number[]): Promise<number> {
	let updated = 0;
	for (const chunk of chunked(pageIds)) {
		const ids = sql`ARRAY[${sql.join(
			chunk.map((id) => sql`${id}::bigint`),
			sql`, `,
		)}]`;
		// Locked in page order, the order a rollup refresh adds copies in, so the two can't deadlock.
		const result = await conn.execute(sql`
			WITH stale AS (
				SELECT b.brand_id, b.page_id
				FROM ${rollupCitationPages} b
				JOIN ${citedPages} p ON p.id = b.page_id
				WHERE b.page_id = ANY(${ids}) AND ${copyColumns("b")} IS DISTINCT FROM ${copyColumns("p")}
				ORDER BY b.page_id, b.brand_id
				FOR NO KEY UPDATE OF b
			)
			UPDATE ${rollupCitationPages} b
			SET url = p.url, domain = p.domain, title = p.title, page_type = p.page_type, static_category = p.static_category
			FROM stale, ${citedPages} p
			WHERE b.brand_id = stale.brand_id AND b.page_id = stale.page_id AND p.id = b.page_id
		`);
		updated += result.rowCount ?? 0;
	}
	return updated;
}

/**
 * Brings brands' copies of pages up to date with `cited_pages`: pages changed,
 * and copies added, since the last sync. Copies are added from a snapshot that
 * a page change can overtake, which is why new copies are checked too.
 */
export async function syncChangedPages(conn: DbConnection): Promise<number> {
	const startedAt = await conn.execute<{ now: string }>(sql`SELECT now()::text AS now`);
	const now = startedAt.rows[0].now;
	const [state] = await conn.select({ syncedAt: pipelineState.pagesSyncedAt }).from(pipelineState).limit(1);

	let candidates: { page_id: number }[];
	if (state?.syncedAt) {
		const since = sql`${state.syncedAt.toISOString()}::timestamptz - ${SYNC_MARGIN}`;
		candidates = (
			await conn.execute<{ page_id: number }>(sql`
				SELECT page_id FROM ${citedPageChanges} WHERE changed_at >= ${since}
				UNION
				SELECT page_id FROM ${rollupCitationPages} WHERE created_at >= ${since}
			`)
		).rows;
	} else {
		// Whatever was cited or changed while the copies were being filled, before the triggers kept them.
		const since = sql`now() - ${FIRST_SYNC_LOOKBACK}`;
		await conn.execute(sql`
			INSERT INTO ${rollupCitationPages} (brand_id, page_id, url, domain, title, page_type, static_category)
			SELECT DISTINCT r.brand_id, cp.id, cp.url, cp.domain, cp.title, cp.page_type, cp.static_category
			FROM ${rollupCitationUrls} r
			JOIN ${citedPages} cp ON cp.id = r.page_id
			WHERE r.bucket >= ${since}
			ORDER BY r.brand_id, cp.id
			ON CONFLICT (brand_id, page_id) DO NOTHING
		`);
		candidates = (
			await conn.execute<{ page_id: number }>(
				sql`SELECT id AS page_id FROM ${citedPages} WHERE last_seen_at >= ${since}`,
			)
		).rows;
	}

	const updated = await syncPages(
		conn,
		candidates.map((row) => Number(row.page_id)).sort((a, b) => a - b),
	);
	await conn.execute(sql`
		UPDATE ${pipelineState}
		SET pages_synced_at = ${now}::timestamptz
		WHERE pages_synced_at IS NULL OR pages_synced_at < ${now}::timestamptz
	`);
	return updated;
}
