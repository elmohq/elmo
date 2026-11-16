import { sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { citedPages, rollupCitationPages, rollupCitationUrls } from "../db/schema";

const copyColumns = (table: string) =>
	sql.raw(`(${table}.url, ${table}.domain, ${table}.title, ${table}.page_type, ${table}.static_category)`);

/**
 * Refreshes the brand's copies of the pages its rollup cites in the range, adding
 * any it lacks. Rows go in page order, as `updatePageCopies` locks them, so the
 * two can't deadlock.
 */
export async function copyBrandPages(tx: DbConnection, brandId: string, from: Date, toExclusive: Date): Promise<void> {
	await tx.execute(sql`
		INSERT INTO ${rollupCitationPages} AS b (brand_id, page_id, url, domain, title, page_type, static_category)
		SELECT ${brandId}, cp.id, cp.url, cp.domain, cp.title, cp.page_type, cp.static_category
		FROM ${citedPages} cp
		WHERE cp.id IN (
			SELECT page_id FROM ${rollupCitationUrls}
			WHERE brand_id = ${brandId} AND bucket >= ${from} AND bucket < ${toExclusive}
		)
		ORDER BY cp.id
		ON CONFLICT (brand_id, page_id) DO UPDATE
		SET url = excluded.url, domain = excluded.domain, title = excluded.title,
			page_type = excluded.page_type, static_category = excluded.static_category
		WHERE ${copyColumns("b")} IS DISTINCT FROM ${copyColumns("excluded")}
	`);
}

/** Brings every brand's copies of these pages in line with `cited_pages`. */
export async function updatePageCopies(tx: DbConnection, pageIds: number[]): Promise<void> {
	if (pageIds.length === 0) return;
	const ids = sql`ARRAY[${sql.join(
		pageIds.map((id) => sql`${id}::bigint`),
		sql`, `,
	)}]`;
	await tx.execute(sql`
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
}
