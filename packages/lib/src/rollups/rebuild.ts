import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import {
	citations,
	citedPages,
	promptRuns,
	rollupCitationDomains,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupPromptRuns,
} from "../db/schema";
import {
	aggregateCitationBucket,
	type CitationSourceRow,
	type DomainRollupRow,
	type PageUpsert,
	type UrlRollupRow,
} from "./aggregate-citations";
import { assertBucketAligned, bucketSql } from "./bucket";
import { chunked } from "./chunk";
import { inTransaction } from "./transaction";

export interface RebuildStats {
	/** Rows written to each table, not the raw rows they were aggregated from. */
	runs: number;
	competitorRows: number;
	urlRows: number;
	domainRows: number;
	pages: number;
}

/**
 * Rebuilds every rollup table for one brand over `[from, toExclusive)`.
 *
 * Delete-and-reinsert is the only way rollup rows are written, so a rebuild is
 * idempotent and a bucket can be replayed from raw at any time. Pass the db
 * handle to get a transaction of its own, or an open transaction to join it (the
 * rebuild then runs in a savepoint and rolls back without taking the caller with
 * it). Both bounds must be bucket-aligned.
 */
export async function rebuildRange(
	conn: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<RebuildStats> {
	assertBucketAligned(from);
	assertBucketAligned(toExclusive);
	return inTransaction(conn, async (tx) => {
		// Serializes with any other rebuild of this brand, so a manual rebuild and
		// the scheduled one cannot interleave their deletes and inserts.
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${brandId}))`);
		await clearRange(tx, brandId, from, toExclusive);
		const runs = await insertPromptRunRollup(tx, brandId, from, toExclusive);
		const competitorRows = await insertCompetitorRollup(tx, brandId, from, toExclusive);
		const citationStats = await rebuildCitations(tx, brandId, from, toExclusive);
		return { runs, competitorRows, ...citationStats };
	});
}

async function clearRange(tx: DbConnection, brandId: string, from: Date, toExclusive: Date): Promise<void> {
	for (const table of [rollupPromptRuns, rollupCompetitorMentions, rollupCitationUrls, rollupCitationDomains]) {
		await tx.execute(sql`
			DELETE FROM ${table}
			WHERE brand_id = ${brandId} AND bucket >= ${from} AND bucket < ${toExclusive}
		`);
	}
}

const runsInRange = (brandId: string, from: Date, toExclusive: Date) =>
	sql`WHERE brand_id = ${brandId} AND created_at >= ${from} AND created_at < ${toExclusive}`;

async function insertPromptRunRollup(
	tx: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<number> {
	const bucket = bucketSql(sql`created_at`);
	const result = await tx.execute(sql`
		INSERT INTO ${rollupPromptRuns} (
			brand_id, bucket, prompt_id, model, provider, web_search_enabled,
			runs, brand_mentioned_runs, competitor_runs, competitor_mentions, first_run_at, last_run_at
		)
		SELECT
			brand_id,
			${bucket},
			prompt_id,
			model,
			coalesce(provider, ''),
			web_search_enabled,
			count(*)::int,
			count(*) FILTER (WHERE brand_mentioned)::int,
			count(*) FILTER (WHERE cardinality(competitors_mentioned) > 0)::int,
			coalesce(sum(cardinality(competitors_mentioned)), 0)::int,
			min(created_at),
			max(created_at)
		FROM ${promptRuns}
		${runsInRange(brandId, from, toExclusive)}
		GROUP BY brand_id, ${bucket}, prompt_id, model, coalesce(provider, ''), web_search_enabled
	`);
	return result.rowCount ?? 0;
}

async function insertCompetitorRollup(
	tx: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<number> {
	const bucket = bucketSql(sql`created_at`);
	const result = await tx.execute(sql`
		INSERT INTO ${rollupCompetitorMentions} (
			brand_id, bucket, prompt_id, model, provider, web_search_enabled, competitor_name, runs
		)
		SELECT
			brand_id,
			${bucket},
			prompt_id,
			model,
			coalesce(provider, ''),
			web_search_enabled,
			competitor_name,
			count(*)::int
		FROM ${promptRuns}, LATERAL unnest(competitors_mentioned) AS competitor_name
		${runsInRange(brandId, from, toExclusive)}
		GROUP BY brand_id, ${bucket}, prompt_id, model, coalesce(provider, ''), web_search_enabled, competitor_name
	`);
	return result.rowCount ?? 0;
}

function readCitations(tx: DbConnection, brandId: string, from: Date, toExclusive: Date): Promise<CitationSourceRow[]> {
	return tx
		.select({
			brandId: citations.brandId,
			promptId: citations.promptId,
			createdAt: citations.createdAt,
			model: citations.model,
			provider: promptRuns.provider,
			webSearchEnabled: promptRuns.webSearchEnabled,
			url: citations.url,
			domain: citations.domain,
			title: citations.title,
			citationIndex: citations.citationIndex,
		})
		.from(citations)
		.innerJoin(promptRuns, eq(promptRuns.id, citations.promptRunId))
		.where(and(eq(citations.brandId, brandId), gte(citations.createdAt, from), lt(citations.createdAt, toExclusive)));
}

/**
 * Upserts the range's pages and returns their ids. A page row is shared by every
 * tenant, so the upsert keeps the widest window seen and the newest title.
 */
async function upsertPages(tx: DbConnection, pages: PageUpsert[]): Promise<Map<string, number>> {
	const ids = new Map<string, number>();
	for (const chunk of chunked(pages)) {
		const rows = await tx
			.insert(citedPages)
			.values(chunk)
			.onConflictDoUpdate({
				target: citedPages.url,
				set: {
					domain: sql`excluded.domain`,
					title: sql`coalesce(excluded.title, ${citedPages.title})`,
					pageType: sql`excluded.page_type`,
					staticCategory: sql`excluded.static_category`,
					classifierVersion: sql`excluded.classifier_version`,
					firstSeenAt: sql`least(${citedPages.firstSeenAt}, excluded.first_seen_at)`,
					lastSeenAt: sql`greatest(${citedPages.lastSeenAt}, excluded.last_seen_at)`,
				},
			})
			.returning({ id: citedPages.id, url: citedPages.url });
		for (const row of rows) ids.set(row.url, row.id);
	}
	return ids;
}

async function insertUrlRollup(tx: DbConnection, rows: UrlRollupRow[], pageIds: Map<string, number>): Promise<number> {
	const values = rows.map(({ url, ...row }) => {
		const pageId = pageIds.get(url);
		if (pageId === undefined) throw new Error(`cited_pages row missing for ${url}`);
		return { ...row, pageId };
	});
	for (const chunk of chunked(values)) await tx.insert(rollupCitationUrls).values(chunk);
	return values.length;
}

async function insertDomainRollup(tx: DbConnection, rows: DomainRollupRow[]): Promise<number> {
	for (const chunk of chunked(rows)) await tx.insert(rollupCitationDomains).values(chunk);
	return rows.length;
}

async function rebuildCitations(
	tx: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<Pick<RebuildStats, "urlRows" | "domainRows" | "pages">> {
	const source = await readCitations(tx, brandId, from, toExclusive);
	const { pages, urls, domains } = aggregateCitationBucket(source);
	const pageIds = await upsertPages(tx, pages);
	const urlRows = await insertUrlRollup(tx, urls, pageIds);
	const domainRows = await insertDomainRollup(tx, domains);
	return { urlRows, domainRows, pages: pages.length };
}
