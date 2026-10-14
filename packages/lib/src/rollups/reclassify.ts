import { and, asc, gt, lt, sql } from "drizzle-orm";
import { classifyPage } from "../citations/page-classification";
import type { DbConnection } from "../db/db-connection";
import { citedPages } from "../db/schema";
import { chunked } from "./chunk";
import { CLASSIFIER_VERSION } from "./constants";

interface StalePage {
	id: number;
	url: string;
	domain: string;
	title: string | null;
}

function readStalePages(conn: DbConnection, afterId: number, batchSize: number): Promise<StalePage[]> {
	return conn
		.select({ id: citedPages.id, url: citedPages.url, domain: citedPages.domain, title: citedPages.title })
		.from(citedPages)
		.where(and(lt(citedPages.classifierVersion, CLASSIFIER_VERSION), gt(citedPages.id, afterId)))
		.orderBy(asc(citedPages.id))
		.limit(batchSize);
}

async function writeChunk(conn: DbConnection, pages: StalePage[]): Promise<number> {
	const values = pages.map((page) => {
		const { pageType, staticCategory } = classifyPage(page.url, page.domain, page.title);
		return sql`(${page.id}::bigint, ${pageType}::text, ${staticCategory}::text, ${CLASSIFIER_VERSION}::int)`;
	});
	// Rebuilds upsert pages sorted by JS string order, which byte order (COLLATE "C") matches;
	// locking in the same order keeps the two from deadlocking.
	return conn.transaction(async (tx) => {
		await tx.execute(sql`
			SELECT 1 FROM ${citedPages} WHERE id IN (${sql.join(
				pages.map((page) => sql`${page.id}::bigint`),
				sql`, `,
			)}) ORDER BY url COLLATE "C" FOR UPDATE
		`);
		const result = await tx.execute(sql`
		UPDATE ${citedPages} AS p
		SET page_type = v.page_type, static_category = v.static_category, classifier_version = v.classifier_version
		FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, page_type, static_category, classifier_version)
		WHERE p.id = v.id
	`);
		return result.rowCount ?? 0;
	});
}

async function writeClassifications(conn: DbConnection, pages: StalePage[]): Promise<number> {
	let updated = 0;
	for (const chunk of chunked(pages)) updated += await writeChunk(conn, chunk);
	return updated;
}

/**
 * Re-runs the classifier over every page stamped with an older version. Each
 * chunk commits on its own and is stamped as it goes, so a crash resumes where
 * it stopped. Reads join page rows live, so nothing needs rebuilding after.
 */
export async function reclassifyPages(conn: DbConnection, batchSize = 1000): Promise<number> {
	let afterId = 0;
	let updated = 0;
	for (;;) {
		const batch = await readStalePages(conn, afterId, batchSize);
		if (batch.length === 0) return updated;
		afterId = batch[batch.length - 1].id;
		updated += await writeClassifications(conn, batch);
	}
}
