import { type SQL, sql } from "drizzle-orm";
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
import { assertBucketAligned, bucketSql } from "./bucket";
import { isFanoutQuery, normalizedWebQuery } from "./fanout";

export interface RebuildStats {
	/** Rows written to each table, not the raw rows they were aggregated from. */
	runs: number;
	competitorRows: number;
	webQueryRows: number;
	urlRows: number;
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
		const urlRows = await insertCitationRollup(tx, brandId, from, toExclusive);
		return { runs, competitorRows, webQueryRows, urlRows };
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

const assessmentColumns = sql.raw(
	"positive_runs, neutral_runs, negative_runs, mixed_runs, position_sum, positioned_runs",
);

/**
 * Sentiment and position measures, in `assessmentColumns` order, over `subject`: an assessment in
 * `run_mentions.assessments`, null for runs that don't count as mentioning it.
 */
const assessmentMeasures = (subject: SQL) => sql`
	count(*) FILTER (WHERE ${subject}->>'sentiment' = 'positive')::int,
	count(*) FILTER (WHERE ${subject}->>'sentiment' = 'neutral')::int,
	count(*) FILTER (WHERE ${subject}->>'sentiment' = 'negative')::int,
	count(*) FILTER (WHERE ${subject}->>'sentiment' = 'mixed')::int,
	coalesce(sum((${subject}->>'position')::int), 0)::int,
	count(${subject}->'position')::int`;

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
			${assessmentColumns},
			fanout_runs, fanout_queries, first_run_at, last_run_at
		)
		SELECT
			${keyColumns},
			count(*)::int,
			count(*) FILTER (WHERE m.brand_mentioned)::int,
			count(*) FILTER (WHERE cardinality(m.competitors_mentioned) > 0)::int,
			coalesce(sum(cardinality(m.competitors_mentioned)), 0)::int,
			count(*) FILTER (WHERE NOT m.brand_mentioned AND coalesce(cardinality(m.competitors_mentioned), 0) = 0)::int,
			${assessmentMeasures(sql`(CASE WHEN m.brand_mentioned THEN m.assessments->'brand' END)`)},
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
			brand_id, bucket, prompt_id, model, provider, web_search_enabled, competitor_name, runs,
			${assessmentColumns}
		)
		SELECT
			${keyColumns},
			c.competitor_name,
			count(*)::int,
			${assessmentMeasures(sql`m.assessments->'competitors'->c.competitor_name`)}
		${brandRuns(brandId)}
		CROSS JOIN LATERAL (SELECT DISTINCT unnest(m.competitors_mentioned) AS competitor_name) c
		${inRange(brandId, from, toExclusive)}
		GROUP BY ${keyColumns}, c.competitor_name
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

async function insertCitationRollup(tx: DbConnection, brandId: string, from: Date, toExclusive: Date): Promise<number> {
	const result = await tx.execute(sql`
		INSERT INTO ${rollupCitationUrls} (
			brand_id, bucket, prompt_id, model, provider, web_search_enabled, page_id, domain, citations, position_sum
		)
		SELECT ${keyColumns}, c.page_id, cp.domain, count(*)::int, sum(c.citation_index)::int
		${brandRuns(brandId)}
		JOIN ${citations} c ON c.prompt_run_id = pr.id
		JOIN ${citedPages} cp ON cp.id = c.page_id
		${inRange(brandId, from, toExclusive)}
		GROUP BY ${keyColumns}, c.page_id, cp.domain
	`);
	return result.rowCount ?? 0;
}
