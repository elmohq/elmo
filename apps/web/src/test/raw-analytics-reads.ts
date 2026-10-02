/**
 * The analytics aggregates computed straight from `prompt_runs` and `citations`,
 * as a reference the rollup reads are checked against (the parity integration
 * tests and `scripts/compare-analytics-reads.ts`). Not used in production.
 *
 * Days here are the true local day of each run, so in a zone whose midnight
 * isn't on a bucket boundary a run in the first minutes of a day lands a day
 * later than the rollups put it.
 */

import { type SQL, sql } from "drizzle-orm";
import {
	modelFilter,
	promptScope,
	queryPg,
	uuidList,
	webSearchFilter,
	windowEnd,
	windowFilter,
	windowStart,
} from "@/lib/analytics-sql";
import type { ResponseSearchScope } from "@/lib/postgres-read";
import type {
	BrandMentionTotals,
	CitationDomainStats,
	CitationUrlStats,
	DailyCitationStats,
	DashboardSummary,
	ModelMentionRateRow,
	PerPromptCitationPageRow,
	PerPromptDailyCitationStats,
	PerPromptDailyCompetitorRow,
	PerPromptDailyMentionRow,
	PerPromptRunStats,
	PerPromptVisibilityPoint,
	ProcessedBatchChartDataPoint,
	PromptFirstEvaluatedAt,
	PromptMentionSummary,
	PromptSummary,
	TopCompetitorMention,
	VisibilityDailyAggregate,
} from "@/lib/rollup-read";

const dateFilter = (fromDate: string | null, toDate: string | null, timezone: string): SQL =>
	windowFilter(sql`created_at`, fromDate, toDate, timezone);

export async function getDashboardSummary(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	enabledPromptIds?: string[],
): Promise<DashboardSummary[]> {
	const rows = await queryPg<DashboardSummary>(sql`
		SELECT
			count(DISTINCT prompt_id)::int AS total_prompts,
			count(*)::int AS total_runs,
			round(count(*) FILTER (WHERE brand_mentioned) * 100.0 / NULLIF(count(*), 0), 0)::int AS avg_visibility,
			round(count(*) FILTER (WHERE brand_mentioned) * 100.0 / NULLIF(count(*), 0), 0)::int AS non_branded_visibility,
			to_char(max(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z' AS last_updated
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
	`);
	return rows;
}

export async function getPerPromptVisibilityTimeSeries(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<PerPromptVisibilityPoint[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptVisibilityPoint>(sql`
		SELECT
			prompt_id,
			(created_at AT TIME ZONE ${timezone})::date AS date,
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id, date
		ORDER BY prompt_id, date
	`);
	return rows;
}

/**
 * Single-query replacement for `getPerPromptVisibilityTimeSeries` + JS
 * `applyPerPromptLVCF`.
 *
 * Builds a (prompt × date) grid in-database, left-joins raw daily observations,
 * and groups rows by the running count of non-null observations to carry the
 * last observation forward. Leading-null dates
 * (before a prompt's first observation) are back-seeded with the prompt's
 * earliest value to mirror the existing JS behavior. The result is already
 * aggregated by day and bucketed by branded / non-branded.
 *
 * Returns one row per date in [fromDate, toDate], which is O(days) transfer
 * rather than O(prompts × days), and drops the JS LVCF pass entirely.
 */
export async function getVisibilityDailyAggregate(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[],
	brandedPromptIds: string[],
	model?: string,
): Promise<VisibilityDailyAggregate[]> {
	if (enabledPromptIds.length === 0) return [];

	// `brandedIdsRelation` is a subquery that yields one row per branded
	// prompt id. Joining prompts_list against it and checking `IS NOT NULL`
	// lets us classify branded prompts *without* relying on `pid = ANY(...)`
	// which has a NULL-element footgun: `ARRAY[]::uuid[]` works fine but
	// `unnest(ARRAY[]::uuid[])` returned 0 rows in a way that let NULLs
	// propagate through an earlier attempt. The LEFT JOIN is explicit and
	// behaves predictably whether the branded set is empty, partial, or all.
	const brandedIdsRelation = brandedPromptIds.length
		? sql`(SELECT unnest(ARRAY[${sql.join(
				brandedPromptIds.map((id) => sql`${id}::uuid`),
				sql`, `,
			)}]::uuid[]) AS bid)`
		: sql`(SELECT NULL::uuid AS bid WHERE FALSE)`;

	const rows = await queryPg<VisibilityDailyAggregate>(sql`
		WITH
			date_range AS (
				SELECT series::date AS day
				FROM generate_series(${fromDate}::date, ${toDate}::date, interval '1 day') AS g(series)
			),
			prompts_list AS (
				SELECT
					p.pid AS prompt_id,
					bp.bid IS NOT NULL AS is_branded
				FROM unnest(ARRAY[${sql.join(
					enabledPromptIds.map((id) => sql`${id}::uuid`),
					sql`, `,
				)}]::uuid[]) AS p(pid)
				LEFT JOIN ${brandedIdsRelation} bp ON bp.bid = p.pid
			),
			observations AS (
				SELECT
					prompt_id,
					(created_at AT TIME ZONE ${timezone})::date AS obs_date,
					count(*)::int AS total_runs,
					count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
				FROM prompt_runs
				WHERE brand_id = ${brandId}
					AND prompt_id IN (${uuidList(enabledPromptIds)})
					AND created_at >= ${windowStart(fromDate, timezone)}
					AND created_at < ${windowEnd(toDate, timezone)}
					${modelFilter(model)}
				-- Group by the SELECT alias, not the full expression: drizzle
				-- emits a fresh $N parameter for every timezone interpolation,
				-- so the SELECT expression and GROUP BY expression aren't
				-- recognized as identical by Postgres and the query errors
				-- with "column prompt_runs.created_at must appear in GROUP BY".
				GROUP BY prompt_id, obs_date
			),
			first_obs AS (
				SELECT DISTINCT ON (prompt_id)
					prompt_id,
					total_runs AS first_runs,
					brand_mentioned_count AS first_mentioned
				FROM observations
				ORDER BY prompt_id, obs_date
			),
			grid AS (
				SELECT
					pl.prompt_id,
					pl.is_branded,
					dr.day AS date,
					obs.total_runs AS actual_runs,
					obs.brand_mentioned_count AS actual_mentioned,
					count(obs.total_runs) OVER (PARTITION BY pl.prompt_id ORDER BY dr.day) AS fwd_grp
				FROM prompts_list pl
				CROSS JOIN date_range dr
				LEFT JOIN observations obs
					ON obs.prompt_id = pl.prompt_id AND obs.obs_date = dr.day
			),
			lvcf AS (
				SELECT
					g.prompt_id,
					g.is_branded,
					g.date,
					g.actual_runs,
					g.actual_mentioned,
					coalesce(
						max(g.actual_runs) OVER (PARTITION BY g.prompt_id, g.fwd_grp),
						fo.first_runs
					) AS lvcf_runs,
					coalesce(
						max(g.actual_mentioned) OVER (PARTITION BY g.prompt_id, g.fwd_grp),
						fo.first_mentioned
					) AS lvcf_mentioned
				FROM grid g
				LEFT JOIN first_obs fo ON fo.prompt_id = g.prompt_id
			)
		SELECT
			to_char(date, 'YYYY-MM-DD') AS date,
			coalesce(sum(actual_runs) FILTER (WHERE is_branded), 0)::int AS actual_branded_runs,
			coalesce(sum(actual_mentioned) FILTER (WHERE is_branded), 0)::int AS actual_branded_mentioned,
			coalesce(sum(actual_runs) FILTER (WHERE NOT is_branded), 0)::int AS actual_nonbranded_runs,
			coalesce(sum(actual_mentioned) FILTER (WHERE NOT is_branded), 0)::int AS actual_nonbranded_mentioned,
			coalesce(sum(lvcf_runs) FILTER (WHERE is_branded), 0)::int AS lvcf_branded_runs,
			coalesce(sum(lvcf_mentioned) FILTER (WHERE is_branded), 0)::int AS lvcf_branded_mentioned,
			coalesce(sum(lvcf_runs) FILTER (WHERE NOT is_branded), 0)::int AS lvcf_nonbranded_runs,
			coalesce(sum(lvcf_mentioned) FILTER (WHERE NOT is_branded), 0)::int AS lvcf_nonbranded_mentioned
		FROM lvcf
		GROUP BY date
		ORDER BY date
	`);
	return rows;
}

/**
 * Plain count of citations for the filter window. The visibility bar needs
 * only this scalar, avoiding a row per date and domain on large tables.
 */
export async function getCitationsTotalCount(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<number> {
	if (enabledPromptIds && enabledPromptIds.length === 0) return 0;
	const rows = await queryPg<{ total: number }>(sql`
		SELECT count(*)::int AS total
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
	`);
	return Number(rows[0]?.total ?? 0);
}

export async function getPromptsFirstEvaluatedAt(
	brandId: string,
	promptIds: string[],
): Promise<PromptFirstEvaluatedAt[]> {
	if (promptIds.length === 0) return [];

	const rows = await queryPg<PromptFirstEvaluatedAt>(sql`
		SELECT
			prompt_id,
			min(created_at) AS first_evaluated_at
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			AND prompt_id IN (${uuidList(promptIds)})
		GROUP BY prompt_id
	`);
	return rows;
}

export async function getPromptsSummary(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	model?: string,
	enabledPromptIds?: string[],
): Promise<PromptSummary[]> {
	const rows = await queryPg<PromptSummary>(sql`
		SELECT
			prompt_id,
			count(*)::int AS total_runs,
			(count(*) FILTER (WHERE brand_mentioned)::float / NULLIF(count(*), 0)) AS brand_mention_rate,
			(count(*) FILTER (WHERE array_length(competitors_mentioned, 1) > 0)::float / NULLIF(count(*), 0)) AS competitor_mention_rate,
			(count(*) FILTER (WHERE brand_mentioned) * 2 + COALESCE(sum(array_length(competitors_mentioned, 1)), 0))::int AS total_weighted_mentions,
			max((created_at AT TIME ZONE ${timezone})::date) AS last_run_date
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${webSearchFilter(webSearchEnabled)}
			${modelFilter(model)}
			${promptScope(brandId, enabledPromptIds)}
		GROUP BY prompt_id
		ORDER BY total_runs DESC
	`);
	return rows;
}

export async function getCitationDomainStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<CitationDomainStats[]> {
	const rows = await queryPg<CitationDomainStats>(sql`
		SELECT
			domain,
			count(*)::int AS count,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS example_title
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
		GROUP BY domain
		ORDER BY count DESC
	`);
	return rows;
}

export async function getCitationUrlStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<CitationUrlStats[]> {
	const rows = await queryPg<CitationUrlStats>(sql`
		SELECT
			url,
			domain,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count,
			round(avg(citation_index)::numeric, 1)::float AS avg_position,
			count(DISTINCT prompt_id)::int AS prompt_count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
		GROUP BY url, domain
		ORDER BY count DESC
	`);
	return rows;
}

export async function getCitationDomainPromptCounts(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<Map<string, number>> {
	const rows = await queryPg<{ domain: string; prompt_count: number }>(sql`
		SELECT domain, count(DISTINCT prompt_id)::int AS prompt_count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
		GROUP BY domain
	`);
	return new Map(rows.map((row) => [row.domain, Number(row.prompt_count)]));
}

export async function getPromptCitationUrlStats(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<CitationUrlStats[]> {
	const rows = await queryPg<CitationUrlStats>(sql`
		SELECT
			url,
			domain,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count,
			round(avg(citation_index)::numeric, 1)::float AS avg_position,
			count(DISTINCT prompt_id)::int AS prompt_count
		FROM citations
		WHERE prompt_id = ${promptId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
		GROUP BY url, domain
		ORDER BY count DESC
	`);
	return rows;
}

export async function getPromptMentionSummary(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<PromptMentionSummary> {
	const rows = await queryPg<PromptMentionSummary>(sql`
		SELECT
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count,
			COALESCE(sum(array_length(competitors_mentioned, 1)), 0)::int AS competitor_mentioned_count,
			count(*) FILTER (WHERE NOT brand_mentioned AND coalesce(cardinality(competitors_mentioned), 0) = 0)::int
				AS no_mention_count
		FROM prompt_runs
		WHERE prompt_id = ${promptId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
	`);
	return rows[0] || { total_runs: 0, brand_mentioned_count: 0, competitor_mentioned_count: 0, no_mention_count: 0 };
}

export async function getPromptTopCompetitorMentions(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	limit?: number,
): Promise<TopCompetitorMention[]> {
	const rows = await queryPg<TopCompetitorMention>(sql`
		SELECT
			competitor_name,
			count(DISTINCT pr.id)::int AS mention_count
		FROM prompt_runs pr, unnest(pr.competitors_mentioned) AS competitor_name
		WHERE pr.prompt_id = ${promptId}
			AND pr.created_at >= ${windowStart(fromDate, timezone)}
			AND pr.created_at < ${windowEnd(toDate, timezone)}
		GROUP BY competitor_name
		ORDER BY mention_count DESC
		LIMIT ${limit ?? null}
	`);
	return rows;
}

export async function getDailyCitationStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<DailyCitationStats[]> {
	const rows = await queryPg<DailyCitationStats>(sql`
		SELECT
			(created_at AT TIME ZONE ${timezone})::date AS date,
			domain,
			count(*)::int AS count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
		GROUP BY date, domain
		ORDER BY date
	`);
	return rows;
}

export async function getPerPromptDailyCitationStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<PerPromptDailyCitationStats[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptDailyCitationStats>(sql`
		SELECT
			prompt_id,
			(created_at AT TIME ZONE ${timezone})::date AS date,
			domain,
			count(*)::int AS count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
		GROUP BY prompt_id, date, domain
		ORDER BY prompt_id, date
	`);
	return rows;
}

export async function getPerPromptRunStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<PerPromptRunStats[]> {
	const rows = await queryPg<PerPromptRunStats>(sql`
		SELECT
			prompt_id,
			count(*)::int AS runs,
			count(DISTINCT (created_at AT TIME ZONE ${timezone})::date)::int AS run_days,
			round(avg(CASE WHEN brand_mentioned THEN 1 ELSE 0 END)::numeric, 4)::float AS brand_mention_rate,
			round(avg(CASE WHEN cardinality(competitors_mentioned) > 0 THEN 1 ELSE 0 END)::numeric, 4)::float AS competitor_mention_rate
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id
	`);
	return rows;
}

export async function getBrandMentionTotals(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<BrandMentionTotals> {
	const rows = await queryPg<BrandMentionTotals>(sql`
		SELECT
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_runs,
			count(DISTINCT prompt_id) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_prompts
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model)}
	`);
	return rows[0] ?? { total_runs: 0, brand_mentioned_runs: 0, brand_mentioned_prompts: 0 };
}

/** Per-prompt, per-day brand and competitor mention counts — feeds LVCF-smoothed share of voice. */
export async function getPerPromptDailyMentions(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<PerPromptDailyMentionRow[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptDailyMentionRow>(sql`
		SELECT
			prompt_id,
			(created_at AT TIME ZONE ${timezone})::date::text AS date,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentions,
			COALESCE(sum(cardinality(competitors_mentioned)), 0)::int AS competitor_mentions
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id, date
		ORDER BY prompt_id, date
	`);
	return rows;
}

/**
 * Per-prompt, per-day, per-competitor mention counts. Feeds the LVCF "current
 * standings" leaderboard so the headline number, donut, and table all reflect
 * the same last-day state as the share-of-voice trend (rather than a whole-window
 * aggregate that wouldn't match the line's end).
 */
export async function getPerPromptDailyCompetitorMentions(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<PerPromptDailyCompetitorRow[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptDailyCompetitorRow>(sql`
		SELECT
			prompt_id,
			(created_at AT TIME ZONE ${timezone})::date::text AS date,
			competitor,
			count(*)::int AS mentions
		FROM prompt_runs, unnest(competitors_mentioned) AS competitor
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id, date, competitor
		ORDER BY prompt_id, date
	`);
	return rows;
}

/** Per prompt, citations at the page (URL) level: one row per prompt+URL with a
 * representative title and its domain, ordered by count. Aggregate to domains in
 * JS for the landscape digest; use the URLs for the citation drill-downs. */
export async function getPerPromptCitationPages(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<PerPromptCitationPageRow[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptCitationPageRow>(sql`
		SELECT
			prompt_id,
			url,
			domain,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count
		FROM citations
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
		GROUP BY prompt_id, url, domain
		ORDER BY prompt_id, count DESC
	`);
	return rows;
}

/** Brand mention rate grouped by model, over a window — how the brand is doing
 * on each tracked platform. */
export async function getBrandMentionRateByModel(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<ModelMentionRateRow[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<ModelMentionRateRow>(sql`
		SELECT
			model,
			count(*)::int AS runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptScope(brandId, enabledPromptIds)}
			${modelFilter(model, { source: "prompt_runs" })}
		GROUP BY model
		ORDER BY runs DESC
	`);
	return rows;
}

export async function getBrandEarliestRunDate(brandId: string): Promise<string | null> {
	const rows = await queryPg<{ earliest_date: string | null }>(sql`
		SELECT min(created_at) AS earliest_date
		FROM prompt_runs
		WHERE brand_id = ${brandId}
	`);
	return rows[0]?.earliest_date || null;
}

export async function getBatchChartData(
	brandId: string,
	promptIds: string[],
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	model?: string,
): Promise<ProcessedBatchChartDataPoint[]> {
	if (promptIds.length === 0) return [];

	const [brandData, competitorData] = await Promise.all([
		queryPg<{
			prompt_id: string;
			date: string;
			total_runs: number;
			brand_mentioned_count: number;
		}>(sql`
			SELECT
				prompt_id,
				(created_at AT TIME ZONE ${timezone})::date AS date,
				count(*)::int AS total_runs,
				count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
			FROM prompt_runs
			WHERE brand_id = ${brandId}
				AND prompt_id IN (${uuidList(promptIds)})
				${dateFilter(fromDate, toDate, timezone)}
				${webSearchFilter(webSearchEnabled)}
				${modelFilter(model)}
			GROUP BY prompt_id, date
			ORDER BY prompt_id, date
		`),
		queryPg<{
			prompt_id: string;
			date: string;
			competitor_name: string;
			mention_count: number;
		}>(sql`
			SELECT
				prompt_id,
				(created_at AT TIME ZONE ${timezone})::date AS date,
				competitor_name,
				count(*)::int AS mention_count
			FROM prompt_runs, unnest(competitors_mentioned) AS competitor_name
			WHERE brand_id = ${brandId}
				AND prompt_id IN (${uuidList(promptIds)})
				${dateFilter(fromDate, toDate, timezone)}
				${webSearchFilter(webSearchEnabled)}
				${modelFilter(model)}
			GROUP BY prompt_id, date, competitor_name
			ORDER BY prompt_id, date, competitor_name
		`),
	]);

	const competitorMap = new Map<string, Map<string, Record<string, number>>>();
	for (const row of competitorData) {
		const dateKey = String(row.date);
		if (!competitorMap.has(row.prompt_id)) competitorMap.set(row.prompt_id, new Map());
		const promptData = competitorMap.get(row.prompt_id)!;
		if (!promptData.has(dateKey)) promptData.set(dateKey, {});
		promptData.get(dateKey)![row.competitor_name] = Number(row.mention_count);
	}

	return brandData.map((row) => ({
		prompt_id: row.prompt_id,
		date: row.date,
		total_runs: row.total_runs,
		brand_mentioned_count: row.brand_mentioned_count,
		competitor_counts: competitorMap.get(row.prompt_id)?.get(String(row.date)) || {},
	}));
}

export async function countResponses(scope: ResponseSearchScope): Promise<number> {
	if (scope.promptIds.length === 0) return 0;
	const rows = await queryPg<{ total: number }>(sql`
		SELECT count(*)::int AS total
		FROM prompt_runs
		WHERE brand_id = ${scope.brandId}
			${dateFilter(scope.fromDate, scope.toDate, scope.timezone)}
			${promptScope(scope.brandId, scope.promptIds)}
			${modelFilter(scope.model)}
	`);
	return rows[0]?.total ?? 0;
}
