import { sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { citations, promptRuns, rollupCitationDomains, rollupPromptRuns } from "../db/schema";

/** Each pair is `[rollup, raw]`; they are equal when the rollup is in step. */
export interface BucketComparison {
	runs: [number, number];
	brandMentioned: [number, number];
	citations: [number, number];
}

const toCount = (value: unknown): number => Number(value ?? 0);

async function rollupTotals(
	conn: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<{ runs: number; brandMentioned: number; citations: number }> {
	const runs = await conn.execute(sql`
		SELECT coalesce(sum(runs), 0) AS runs, coalesce(sum(brand_mentioned_runs), 0) AS brand_mentioned
		FROM ${rollupPromptRuns}
		WHERE brand_id = ${brandId} AND bucket >= ${from} AND bucket < ${toExclusive}
	`);
	const cited = await conn.execute(sql`
		SELECT coalesce(sum(citations), 0) AS citations
		FROM ${rollupCitationDomains}
		WHERE brand_id = ${brandId} AND bucket >= ${from} AND bucket < ${toExclusive}
	`);
	const totals = runs.rows[0] as { runs: unknown; brand_mentioned: unknown };
	return {
		runs: toCount(totals?.runs),
		brandMentioned: toCount(totals?.brand_mentioned),
		citations: toCount((cited.rows[0] as { citations: unknown })?.citations),
	};
}

async function rawTotals(
	conn: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<{ runs: number; brandMentioned: number; citations: number }> {
	const runs = await conn.execute(sql`
		SELECT count(*) AS runs, count(*) FILTER (WHERE brand_mentioned) AS brand_mentioned
		FROM ${promptRuns}
		WHERE brand_id = ${brandId} AND created_at >= ${from} AND created_at < ${toExclusive}
	`);
	const cited = await conn.execute(sql`
		SELECT count(*) AS citations
		FROM ${citations}
		WHERE brand_id = ${brandId} AND created_at >= ${from} AND created_at < ${toExclusive}
	`);
	const totals = runs.rows[0] as { runs: unknown; brand_mentioned: unknown };
	return {
		runs: toCount(totals?.runs),
		brandMentioned: toCount(totals?.brand_mentioned),
		citations: toCount((cited.rows[0] as { citations: unknown })?.citations),
	};
}

/**
 * Rollup totals against the raw rows they came from, for drift detection. A
 * range that disagrees is a bug or a missed invalidation, and rebuilding it is
 * the fix.
 */
export async function compareBucket(
	conn: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
): Promise<BucketComparison> {
	const rollup = await rollupTotals(conn, brandId, from, toExclusive);
	const raw = await rawTotals(conn, brandId, from, toExclusive);
	return {
		runs: [rollup.runs, raw.runs],
		brandMentioned: [rollup.brandMentioned, raw.brandMentioned],
		citations: [rollup.citations, raw.citations],
	};
}
