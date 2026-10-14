import { and, eq, gte, lt, type SQL, sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import {
	citations,
	citedPages,
	promptRuns,
	prompts,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupPromptRuns,
	rollupWebQueries,
	runMentions,
} from "../db/schema";
import {
	aggregateCitationBucket,
	type CitationSourceRow,
	type PageUpsert,
	type UrlRollupRow,
} from "./aggregate-citations";
import { assertBucketAligned, bucketSql } from "./bucket";
import { chunked } from "./chunk";
import { isFanoutQuery, normalizedWebQuery } from "./fanout";

export interface RebuildStats {
	/** Rows written to each table, not the raw rows they were aggregated from. */
	runs: number;
	competitorRows: number;
	webQueryRows: number;
	urlRows: number;
	pages: number;
}

/**
 * Serializes everything that rewrites a brand's rollup rows: two rebuilds can't
 * interleave their deletes and inserts, and a prompt delete can't deadlock a
 * rebuild between its cascade into the rollups and the rebuild's foreign key check.
 */
export async function lockBrandRollups(tx: DbConnection, brandId: string): Promise<void> {
	await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('elmo-rollups'), hashtext(${brandId}))`);
}

/** `lockBrandRollups` without waiting: false when someone else is rewriting the brand. */
export async function tryLockBrandRollups(tx: DbConnection, brandId: string): Promise<boolean> {
	const result = await tx.execute<{ locked: boolean }>(
		sql`SELECT pg_try_advisory_xact_lock(hashtext('elmo-rollups'), hashtext(${brandId})) AS locked`,
	);
	return result.rows[0]?.locked === true;
}

/**
 * Delete-and-reinsert is the only way rollup rows are written, so a bucket can be
 * replayed from raw at any time. Given an open transaction, the rebuild runs in a
 * savepoint and rolls back without taking the caller with it.
 */
export async function rebuildRange(
	conn: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<RebuildStats> {
	assertBucketAligned(from);
	assertBucketAligned(toExclusive);
	return conn.transaction(async (tx) => {
		await lockBrandRollups(tx, brandId);
		await clearRange(tx, brandId, from, toExclusive);
		const runs = await insertPromptRunRollup(tx, brandId, from, toExclusive);
		const competitorRows = await insertCompetitorRollup(tx, brandId, from, toExclusive);
		const webQueryRows = await insertWebQueryRollup(tx, brandId, from, toExclusive);
		const citationStats = await rebuildCitations(tx, brandId, from, toExclusive);
		return { runs, competitorRows, webQueryRows, ...citationStats };
	});
}

async function clearRange(tx: DbConnection, brandId: string, from: Date, toExclusive: Date): Promise<void> {
	for (const table of [rollupPromptRuns, rollupCompetitorMentions, rollupWebQueries, rollupCitationUrls]) {
		await tx.execute(sql`
			DELETE FROM ${table}
			WHERE brand_id = ${brandId} AND bucket >= ${from} AND bucket < ${toExclusive}
		`);
	}
}

const bucket = bucketSql(sql`pr.created_at`);
const keyColumns = sql`pr.brand_id, ${bucket}, pr.prompt_id, pr.model, coalesce(pr.provider, ''), pr.web_search_enabled`;

// `pr` is a run joined to its prompt `p` and its mentions `m`. Reaching runs through the brand's prompts
// lets each lookup use `(prompt_id, created_at)`: prompt_runs has no brand index,
// and `created_at` alone would scan every brand's runs.
const brandRuns = (brandId: string) => sql`
	FROM ${promptRuns} pr
	JOIN ${prompts} p ON p.id = pr.prompt_id AND p.brand_id = ${brandId}
	JOIN ${runMentions} m ON m.run_id = pr.id`;

const inRange = (brandId: string, from: Date, toExclusive: Date) =>
	sql`WHERE pr.brand_id = ${brandId} AND pr.created_at >= ${from} AND pr.created_at < ${toExclusive}`;

async function insertPromptRunRollup(
	tx: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<number> {
	const result = await tx.execute(sql`
		INSERT INTO ${rollupPromptRuns} (
			brand_id, bucket, prompt_id, model, provider, web_search_enabled,
			runs, brand_mentioned_runs, competitor_runs, competitor_mentions, no_mention_runs,
			fanout_runs, fanout_queries, first_run_at, last_run_at
		)
		SELECT
			${keyColumns},
			count(*)::int,
			count(*) FILTER (WHERE m.brand_mentioned)::int,
			count(*) FILTER (WHERE cardinality(m.competitors_mentioned) > 0)::int,
			coalesce(sum(cardinality(m.competitors_mentioned)), 0)::int,
			count(*) FILTER (WHERE NOT m.brand_mentioned AND coalesce(cardinality(m.competitors_mentioned), 0) = 0)::int,
			count(*) FILTER (WHERE fanout.queries > 0)::int,
			coalesce(sum(fanout.queries), 0)::int,
			min(pr.created_at),
			max(pr.created_at)
		${brandRuns(brandId)}
		CROSS JOIN LATERAL (
			SELECT count(DISTINCT ${normalizedWebQuery(sql`q`)})::int AS queries
			FROM unnest(pr.web_queries) AS q
			WHERE ${isFanoutQuery(sql`q`, sql`p.value`)}
		) fanout
		${inRange(brandId, from, toExclusive)}
		GROUP BY ${keyColumns}
	`);
	return result.rowCount ?? 0;
}

async function insertCompetitorRollup(
	tx: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<number> {
	const result = await tx.execute(sql`
		INSERT INTO ${rollupCompetitorMentions} (
			brand_id, bucket, prompt_id, model, provider, web_search_enabled, competitor_name, runs
		)
		SELECT ${keyColumns}, competitor_name, count(DISTINCT pr.id)::int
		${brandRuns(brandId)}
		CROSS JOIN LATERAL unnest(m.competitors_mentioned) AS competitor_name
		${inRange(brandId, from, toExclusive)}
		GROUP BY ${keyColumns}, competitor_name
	`);
	return result.rowCount ?? 0;
}

async function insertWebQueryRollup(tx: DbConnection, brandId: string, from: Date, toExclusive: Date): Promise<number> {
	const result = await tx.execute(sql`
		INSERT INTO ${rollupWebQueries} (
			brand_id, bucket, prompt_id, model, provider, web_search_enabled, query, runs, brand_mentioned_runs
		)
		SELECT ${keyColumns}, fanout.query, count(*)::int, count(*) FILTER (WHERE m.brand_mentioned)::int
		${brandRuns(brandId)}
		CROSS JOIN LATERAL (
			SELECT DISTINCT ${normalizedWebQuery(sql`q`)} AS query
			FROM unnest(pr.web_queries) AS q
			WHERE ${isFanoutQuery(sql`q`, sql`p.value`)}
		) fanout
		${inRange(brandId, from, toExclusive)}
		GROUP BY ${keyColumns}, fanout.query
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
 * Ranges are rebuilt in any order (the backfill goes newest-first), so a page
 * must keep the title that was seen most recently, not the one from whichever
 * rebuild ran last. A titled range beats an untitled row outright; otherwise
 * the more recent range wins. The classification travels with the title it
 * was computed from.
 */
const incomingTitleWins = sql`CASE
	WHEN excluded.title IS NOT NULL THEN (${citedPages.title} IS NULL OR excluded.last_seen_at >= ${citedPages.lastSeenAt})
	ELSE (${citedPages.title} IS NULL AND excluded.last_seen_at >= ${citedPages.lastSeenAt})
END`;

const withTitle = (incoming: SQL, existing: SQL): SQL =>
	sql`CASE WHEN ${incomingTitleWins} THEN ${incoming} ELSE ${existing} END`;

/** A page row is shared by every tenant, so the upsert keeps the widest window seen. */
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
					title: withTitle(sql`excluded.title`, sql`${citedPages.title}`),
					pageType: withTitle(sql`excluded.page_type`, sql`${citedPages.pageType}`),
					staticCategory: withTitle(sql`excluded.static_category`, sql`${citedPages.staticCategory}`),
					classifierVersion: withTitle(sql`excluded.classifier_version`, sql`${citedPages.classifierVersion}`),
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

async function rebuildCitations(
	tx: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<Pick<RebuildStats, "urlRows" | "pages">> {
	const source = await readCitations(tx, brandId, from, toExclusive);
	const { pages, urls } = aggregateCitationBucket(source);
	const pageIds = await upsertPages(tx, pages);
	const urlRows = await insertUrlRollup(tx, urls, pageIds);
	return { urlRows, pages: pages.length };
}
