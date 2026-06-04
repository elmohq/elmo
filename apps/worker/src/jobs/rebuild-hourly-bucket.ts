/**
 * Atomic rebuild of all four `hourly_*` aggregate tables for one
 * `(brand_id, UTC date)` bucket.
 *
 * Used by both:
 *   - `refresh-hourly-aggregates` (per-minute pg-boss job)
 *   - the backfill CLI script
 *
 * The pattern is DELETE the bucket then INSERT … SELECT … from the source
 * tables. UPSERT is awkward because the natural primary keys include
 * dimensions (model, web_search_enabled, …) that may disappear between
 * source revisions, leaving stale rows behind. DELETE + INSERT guarantees
 * the bucket exactly mirrors the source.
 *
 * Caller is responsible for wrapping this in its own transaction. The
 * worker wraps the whole tick (one tx per tick); the backfill wraps each
 * bucket individually so a partial failure leaves the cursor pointed at
 * the last successfully-committed bucket.
 */
import { sql } from "drizzle-orm";
import type { db } from "@workspace/lib/db/db";

// Drizzle's transaction type, derived from the live `db` instance so it
// carries the same `schema` generic. We don't actually use the typed query
// builder here — only `tx.execute(sql\`…\`)` — but matching the type lets
// callers pass `tx` from `db.transaction(...)` without casts.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Rebuild a single bucket. `dateStr` is `YYYY-MM-DD` (UTC date).
 *
 * The source-side date range is the half-open interval
 * `[date 00:00:00 UTC, (date+1) 00:00:00 UTC)`. The worker bucketing
 * (`date_trunc('hour', created_at)`) yields the `hour` column.
 */
export async function rebuildBucket(tx: Tx, brandId: string, dateStr: string): Promise<void> {
	const dayStart = sql`(${dateStr}::date)::timestamptz`;
	const dayEnd = sql`((${dateStr}::date + interval '1 day'))::timestamptz`;

	// 1. hourly_prompt_runs ----------------------------------------------------
	await tx.execute(sql`
		DELETE FROM hourly_prompt_runs
		WHERE brand_id = ${brandId}
			AND hour >= ${dayStart}
			AND hour < ${dayEnd}
	`);
	await tx.execute(sql`
		INSERT INTO hourly_prompt_runs
			(brand_id, prompt_id, hour, model, web_search_enabled,
			 total_runs, brand_mentioned_count, competitor_run_count, competitor_mention_sum,
			 first_run_at, last_run_at)
		SELECT
			brand_id,
			prompt_id,
			date_trunc('hour', created_at) AS hour,
			model,
			web_search_enabled,
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count,
			count(*) FILTER (WHERE coalesce(array_length(competitors_mentioned, 1), 0) > 0)::int AS competitor_run_count,
			coalesce(sum(coalesce(array_length(competitors_mentioned, 1), 0)), 0)::int AS competitor_mention_sum,
			min(created_at) AS first_run_at,
			max(created_at) AS last_run_at
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			AND created_at >= ${dayStart}
			AND created_at < ${dayEnd}
		GROUP BY brand_id, prompt_id, date_trunc('hour', created_at), model, web_search_enabled
	`);

	// 2. hourly_prompt_run_competitors ----------------------------------------
	await tx.execute(sql`
		DELETE FROM hourly_prompt_run_competitors
		WHERE brand_id = ${brandId}
			AND hour >= ${dayStart}
			AND hour < ${dayEnd}
	`);
	await tx.execute(sql`
		INSERT INTO hourly_prompt_run_competitors
			(brand_id, prompt_id, hour, model, competitor_name, mention_count)
		SELECT
			pr.brand_id,
			pr.prompt_id,
			date_trunc('hour', pr.created_at) AS hour,
			pr.model,
			competitor_name,
			count(*)::int AS mention_count
		FROM prompt_runs pr,
			LATERAL unnest(pr.competitors_mentioned) AS competitor_name
		WHERE pr.brand_id = ${brandId}
			AND pr.created_at >= ${dayStart}
			AND pr.created_at < ${dayEnd}
			AND coalesce(array_length(pr.competitors_mentioned, 1), 0) > 0
		GROUP BY pr.brand_id, pr.prompt_id, date_trunc('hour', pr.created_at), pr.model, competitor_name
	`);

	// 3. hourly_citations ------------------------------------------------------
	await tx.execute(sql`
		DELETE FROM hourly_citations
		WHERE brand_id = ${brandId}
			AND hour >= ${dayStart}
			AND hour < ${dayEnd}
	`);
	await tx.execute(sql`
		INSERT INTO hourly_citations
			(brand_id, prompt_id, hour, model, domain, count)
		SELECT
			brand_id,
			prompt_id,
			date_trunc('hour', created_at) AS hour,
			model,
			domain,
			count(*)::int AS count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${dayStart}
			AND created_at < ${dayEnd}
		GROUP BY brand_id, prompt_id, date_trunc('hour', created_at), model, domain
	`);

	// 4. hourly_citation_urls --------------------------------------------------
	await tx.execute(sql`
		DELETE FROM hourly_citation_urls
		WHERE brand_id = ${brandId}
			AND hour >= ${dayStart}
			AND hour < ${dayEnd}
	`);
	await tx.execute(sql`
		INSERT INTO hourly_citation_urls
			(brand_id, prompt_id, hour, model, url, domain, title, count, sum_citation_index)
		SELECT
			brand_id,
			prompt_id,
			date_trunc('hour', created_at) AS hour,
			model,
			url,
			domain,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count,
			sum(citation_index::int)::int AS sum_citation_index
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${dayStart}
			AND created_at < ${dayEnd}
		GROUP BY brand_id, prompt_id, date_trunc('hour', created_at), model, url, domain
	`);
}
