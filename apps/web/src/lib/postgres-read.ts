/**
 * Postgres analytics read layer.
 *
 * All analytics queries run against PostgreSQL with covering indices
 * on prompt_runs and citations tables.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";

const db = drizzle(process.env.DATABASE_URL!);

// ============================================================================
// Types
// ============================================================================

export interface DashboardSummary {
	total_prompts: number;
	total_runs: number;
	avg_visibility: number;
	non_branded_visibility: number;
	last_updated: string | null;
}

export interface VisibilityTimeSeriesPoint {
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
	is_branded: boolean;
}

export interface PromptSummary {
	prompt_id: string;
	total_runs: number;
	brand_mention_rate: number;
	competitor_mention_rate: number;
	total_weighted_mentions: number;
	last_run_date: string | null;
}

export interface PromptFirstEvaluatedAt {
	prompt_id: string;
	first_evaluated_at: string;
}

export interface PromptDailyStats {
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
}

export interface PromptCompetitorDailyStats {
	date: string;
	competitor_name: string;
	mention_count: number;
}

export interface WebQueryMapping {
	model: string;
	web_query: string;
	created_at_iso: string;
}

export interface CitationDomainStats {
	domain: string;
	count: number;
	example_title: string | null;
}

export interface CitationUrlStats {
	url: string;
	domain: string;
	title: string | null;
	count: number;
	avg_position: number | null;
	prompt_count: number;
}

export interface PromptMentionSummary {
	total_runs: number;
	brand_mentioned_count: number;
	competitor_mentioned_count: number;
}

export interface TopCompetitorMention {
	competitor_name: string;
	mention_count: number;
}

export interface DailyCitationStats {
	date: string;
	domain: string;
	count: number;
}

export interface ProcessedBatchChartDataPoint {
	prompt_id: string;
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
	competitor_counts: Record<string, number>;
}

export interface BatchVisibilityData {
	visibilityTimeSeries: Array<{
		date: string;
		total_runs: number;
		brand_mentioned_count: number;
		is_branded: boolean;
	}>;
	totalRuns: number;
	totalMentioned: number;
}

export interface AdminRunsOverTime {
	date: string;
	count: number;
}

export interface AdminBrandRunStats {
	brand_id: string;
	runs_7d: number;
	runs_30d: number;
	last_run_at: string | null;
}

export interface AdminActiveBrandsOverTime {
	date: string;
	count: number;
}

// ============================================================================
// Helpers
// ============================================================================

async function queryPg<T>(query: SQL): Promise<T[]> {
	const result = await db.execute(query);
	return result.rows as T[];
}

function dateFilter(fromDate: string | null, toDate: string | null, timezone: string): SQL {
	if (!fromDate || !toDate) return sql``;
	return sql`AND created_at >= (${fromDate}::date AT TIME ZONE ${timezone}) AND created_at < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})`;
}

/**
 * Same shape as `dateFilter` but for the `hour` column on the `hourly_*`
 * aggregate tables. Buckets are stored as `timestamptz` at the start of
 * each UTC hour; the filter projects the user's `[fromDate, toDate]`
 * (interpreted in `timezone`) into UTC instants for the `hour` comparison.
 *
 * A bucket is included if its `hour` instant falls within the user's
 * selected day window. Near day boundaries this means the bucket that
 * straddles the user's "today / yesterday" line is attributed to whichever
 * UTC hour it starts on — at hourly resolution this is at most ~1 hour
 * of attribution slack, invisible at chart resolution.
 */
function hourFilter(fromDate: string | null, toDate: string | null, timezone: string): SQL {
	if (!fromDate || !toDate) return sql``;
	return sql`AND hour >= (${fromDate}::date AT TIME ZONE ${timezone}) AND hour < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})`;
}

function uuidList(ids: string[]): SQL {
	return sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
}

function promptIdFilter(enabledPromptIds?: string[]): SQL {
	if (!enabledPromptIds?.length) return sql``;
	return sql`AND prompt_id IN (${uuidList(enabledPromptIds)})`;
}

function modelFilter(model?: string): SQL {
	if (!model) return sql``;
	return sql`AND model = ${model}`;
}

function webSearchFilter(webSearchEnabled?: boolean): SQL {
	if (webSearchEnabled === undefined) return sql``;
	return sql`AND web_search_enabled = ${webSearchEnabled}`;
}

// ============================================================================
// Dashboard Summary
// ============================================================================

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
			coalesce(sum(total_runs), 0)::int AS total_runs,
			round(coalesce(sum(brand_mentioned_count), 0) * 100.0 / NULLIF(coalesce(sum(total_runs), 0), 0), 0)::int AS avg_visibility,
			round(coalesce(sum(brand_mentioned_count), 0) * 100.0 / NULLIF(coalesce(sum(total_runs), 0), 0), 0)::int AS non_branded_visibility,
			to_char(max(last_run_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z' AS last_updated
		FROM hourly_prompt_runs
		WHERE brand_id = ${brandId}
			${hourFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
	`);
	return rows;
}

// ============================================================================
// Per-Prompt Visibility Time Series (for LVCF smoothing)
// ============================================================================

export interface PerPromptVisibilityPoint {
	prompt_id: string;
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
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
			(hour AT TIME ZONE ${timezone})::date AS date,
			sum(total_runs)::int AS total_runs,
			sum(brand_mentioned_count)::int AS brand_mentioned_count
		FROM hourly_prompt_runs
		WHERE brand_id = ${brandId}
			${hourFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id, date
		ORDER BY prompt_id, date
	`);
	return rows;
}

// ============================================================================
// Aggregated Visibility With SQL-Side LVCF
// ============================================================================

export interface VisibilityDailyAggregate {
	date: string;
	/** Raw observation totals — do not include carried-forward values, so period totals stay faithful. */
	actual_branded_runs: number;
	actual_branded_mentioned: number;
	actual_nonbranded_runs: number;
	actual_nonbranded_mentioned: number;
	/** LVCF-smoothed totals used to draw the visibility time-series. */
	lvcf_branded_runs: number;
	lvcf_branded_mentioned: number;
	lvcf_nonbranded_runs: number;
	lvcf_nonbranded_mentioned: number;
}

/**
 * Single-query replacement for `getPerPromptVisibilityTimeSeries` + JS
 * `applyPerPromptLVCF`.
 *
 * Builds a (prompt × date) grid in-database, left-joins raw daily observations,
 * and uses the `count(non_null) OVER (PARTITION BY prompt ORDER BY date)`
 * "grouper" trick to carry the last observation forward. Leading-null dates
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
					(hour AT TIME ZONE ${timezone})::date AS obs_date,
					sum(total_runs)::int AS total_runs,
					sum(brand_mentioned_count)::int AS brand_mentioned_count
				FROM hourly_prompt_runs
				WHERE brand_id = ${brandId}
					AND prompt_id IN (${uuidList(enabledPromptIds)})
					AND hour >= (${fromDate}::date AT TIME ZONE ${timezone})
					AND hour < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})
					${modelFilter(model)}
				-- Group by the SELECT alias, not the full expression: drizzle
				-- emits a fresh $N parameter for every timezone interpolation,
				-- so the SELECT expression and GROUP BY expression aren't
				-- recognized as identical by Postgres and the query errors
				-- with "column hourly_prompt_runs.hour must appear in GROUP BY".
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
 * Plain count of citations for the filter window. Used by the visibility bar,
 * which only needs the scalar total — the old `getDailyCitationStats` call
 * there returned one row per (date × domain) and we reduced to a single
 * number client-side, which is wasteful on large tables.
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
		SELECT coalesce(sum(count), 0)::int AS total
		FROM hourly_citations
		WHERE brand_id = ${brandId}
			AND hour >= (${fromDate}::date AT TIME ZONE ${timezone})
			AND hour < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
	`);
	return Number(rows[0]?.total ?? 0);
}

// ============================================================================
// Visibility Time Series
// ============================================================================

export async function getVisibilityTimeSeries(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	brandedPromptIds: string[],
	enabledPromptIds?: string[],
	model?: string,
): Promise<VisibilityTimeSeriesPoint[]> {
	const isBranded = brandedPromptIds.length > 0
		? sql`(prompt_id IN (${uuidList(brandedPromptIds)}))`
		: sql`FALSE`;
	const rows = await queryPg<VisibilityTimeSeriesPoint>(sql`
		SELECT
			(hour AT TIME ZONE ${timezone})::date AS date,
			sum(total_runs)::int AS total_runs,
			sum(brand_mentioned_count)::int AS brand_mentioned_count,
			${isBranded} AS is_branded
		FROM hourly_prompt_runs
		WHERE brand_id = ${brandId}
			${hourFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY date, is_branded
		ORDER BY date
	`);
	return rows;
}

// ============================================================================
// Prompts Summary
// ============================================================================

export async function getPromptsFirstEvaluatedAt(
	brandId: string,
	promptIds: string[],
): Promise<PromptFirstEvaluatedAt[]> {
	if (promptIds.length === 0) return [];

	const rows = await queryPg<PromptFirstEvaluatedAt>(sql`
		SELECT
			prompt_id,
			min(first_run_at) AT TIME ZONE 'UTC' AS first_evaluated_at
		FROM hourly_prompt_runs
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
			coalesce(sum(total_runs), 0)::int AS total_runs,
			round(coalesce(sum(brand_mentioned_count), 0) * 100.0 / NULLIF(coalesce(sum(total_runs), 0), 0), 0)::int AS brand_mention_rate,
			round(coalesce(sum(competitor_run_count), 0) * 100.0 / NULLIF(coalesce(sum(total_runs), 0), 0), 0)::int AS competitor_mention_rate,
			(coalesce(sum(brand_mentioned_count), 0) * 2 + coalesce(sum(competitor_mention_sum), 0))::int AS total_weighted_mentions,
			max((last_run_at AT TIME ZONE ${timezone})::date) AS last_run_date
		FROM hourly_prompt_runs
		WHERE brand_id = ${brandId}
			${hourFilter(fromDate, toDate, timezone)}
			${webSearchFilter(webSearchEnabled)}
			${modelFilter(model)}
			${promptIdFilter(enabledPromptIds)}
		GROUP BY prompt_id
		ORDER BY total_runs DESC
	`);
	return rows;
}

// ============================================================================
// Prompt Daily Stats
// ============================================================================

export async function getPromptDailyStats(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	model?: string,
): Promise<PromptDailyStats[]> {
	const rows = await queryPg<PromptDailyStats>(sql`
		SELECT
			(hour AT TIME ZONE ${timezone})::date AS date,
			sum(total_runs)::int AS total_runs,
			sum(brand_mentioned_count)::int AS brand_mentioned_count
		FROM hourly_prompt_runs
		WHERE prompt_id = ${promptId}
			${hourFilter(fromDate, toDate, timezone)}
			${webSearchFilter(webSearchEnabled)}
			${modelFilter(model)}
		GROUP BY date
		ORDER BY date
	`);
	return rows;
}

// ============================================================================
// Prompt Competitor Daily Stats
// ============================================================================

export async function getPromptCompetitorDailyStats(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	model?: string,
): Promise<PromptCompetitorDailyStats[]> {
	// `webSearchEnabled` filter cannot be honored from the competitor aggregate
	// (we don't carry that dimension on `hourly_prompt_run_competitors` because
	// it would multiply the row count for a column the chart never filters on).
	// In practice this filter has never been wired up by any caller — see
	// `apps/web/src/server/prompts.ts:getPromptChartDataFn`.
	void webSearchEnabled;
	const rows = await queryPg<PromptCompetitorDailyStats>(sql`
		SELECT
			(hour AT TIME ZONE ${timezone})::date AS date,
			competitor_name,
			sum(mention_count)::int AS mention_count
		FROM hourly_prompt_run_competitors
		WHERE prompt_id = ${promptId}
			${hourFilter(fromDate, toDate, timezone)}
			${modelFilter(model)}
		GROUP BY date, competitor_name
		ORDER BY date, competitor_name
	`);
	return rows;
}

// ============================================================================
// Web Queries for Mapping
// ============================================================================

export async function getPromptWebQueriesForMapping(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
): Promise<WebQueryMapping[]> {
	const rows = await queryPg<WebQueryMapping>(sql`
		SELECT
			model,
			web_query,
			to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z' AS created_at_iso
		FROM prompt_runs, unnest(web_queries) AS web_query
		WHERE prompt_id = ${promptId}
			AND array_length(web_queries, 1) > 0
			${dateFilter(fromDate, toDate, timezone)}
		ORDER BY created_at ASC
	`);
	return rows;
}

// ============================================================================
// Web Query Counts
// ============================================================================

export interface WebQueryCount {
	model: string;
	web_query: string;
	query_count: number;
}

export async function getPromptWebQueryCounts(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	model?: string,
): Promise<WebQueryCount[]> {
	const rows = await queryPg<WebQueryCount>(sql`
		SELECT
			model,
			web_query,
			count(*)::int AS query_count
		FROM prompt_runs, unnest(web_queries) AS web_query
		WHERE prompt_id = ${promptId}
			AND array_length(web_queries, 1) > 0
			${dateFilter(fromDate, toDate, timezone)}
			${modelFilter(model)}
		GROUP BY model, web_query
		ORDER BY model, query_count DESC
	`);
	return rows;
}

// ============================================================================
// Citation Stats (Domain Level)
// ============================================================================

export async function getCitationDomainStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<CitationDomainStats[]> {
	// `example_title` is taken from `hourly_citation_urls` (which carries
	// titles per URL) — pick any non-null title for any URL on this domain
	// in the window. The aggregate-side scan is small enough that this
	// LATERAL is cheap, and avoids needing to keep `title` on the
	// per-domain aggregate.
	const rows = await queryPg<CitationDomainStats>(sql`
		WITH dom AS (
			SELECT
				domain,
				sum(count)::int AS count
			FROM hourly_citations
			WHERE brand_id = ${brandId}
				${hourFilter(fromDate, toDate, timezone)}
				${promptIdFilter(enabledPromptIds)}
				${modelFilter(model)}
			GROUP BY domain
		)
		SELECT
			dom.domain,
			dom.count,
			(SELECT title FROM hourly_citation_urls hu
			 WHERE hu.brand_id = ${brandId} AND hu.domain = dom.domain AND hu.title IS NOT NULL
			 LIMIT 1) AS example_title
		FROM dom
		ORDER BY dom.count DESC
	`);
	return rows;
}

// ============================================================================
// Citation Stats (URL Level)
// ============================================================================

export async function getCitationUrlStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<CitationUrlStats[]> {
	// avg_position derives from the per-bucket `sum_citation_index`:
	//     avg = sum(sum_citation_index) / sum(count)
	// `title` is the most-recently-observed non-null title across the
	// window's buckets. `prompt_count` is the number of distinct prompts
	// that cited the URL.
	const rows = await queryPg<CitationUrlStats>(sql`
		SELECT
			url,
			domain,
			(array_agg(title ORDER BY hour DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			sum(count)::int AS count,
			round(sum(sum_citation_index)::numeric / NULLIF(sum(count), 0), 1)::float AS avg_position,
			count(DISTINCT prompt_id)::int AS prompt_count
		FROM hourly_citation_urls
		WHERE brand_id = ${brandId}
			${hourFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY url, domain
		ORDER BY count DESC
	`);
	return rows;
}

// ============================================================================
// Prompt-Level Citation Stats
// ============================================================================

export async function getPromptCitationStats(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<CitationDomainStats[]> {
	const rows = await queryPg<CitationDomainStats>(sql`
		WITH dom AS (
			SELECT
				domain,
				sum(count)::int AS count
			FROM hourly_citations
			WHERE prompt_id = ${promptId}
				${hourFilter(fromDate, toDate, timezone)}
			GROUP BY domain
		)
		SELECT
			dom.domain,
			dom.count,
			(SELECT title FROM hourly_citation_urls hu
			 WHERE hu.prompt_id = ${promptId} AND hu.domain = dom.domain AND hu.title IS NOT NULL
			 LIMIT 1) AS example_title
		FROM dom
		ORDER BY dom.count DESC
	`);
	return rows;
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
			(array_agg(title ORDER BY hour DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			sum(count)::int AS count,
			round(sum(sum_citation_index)::numeric / NULLIF(sum(count), 0), 1)::float AS avg_position,
			count(DISTINCT prompt_id)::int AS prompt_count
		FROM hourly_citation_urls
		WHERE prompt_id = ${promptId}
			${hourFilter(fromDate, toDate, timezone)}
		GROUP BY url, domain
		ORDER BY count DESC
	`);
	return rows;
}

// ============================================================================
// Prompt Snapshot Queries
// ============================================================================

export async function getPromptMentionSummary(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<PromptMentionSummary> {
	const rows = await queryPg<PromptMentionSummary>(sql`
		SELECT
			coalesce(sum(total_runs), 0)::int AS total_runs,
			coalesce(sum(brand_mentioned_count), 0)::int AS brand_mentioned_count,
			coalesce(sum(competitor_mention_sum), 0)::int AS competitor_mentioned_count
		FROM hourly_prompt_runs
		WHERE prompt_id = ${promptId}
			${hourFilter(fromDate, toDate, timezone)}
	`);
	return rows[0] || { total_runs: 0, brand_mentioned_count: 0, competitor_mentioned_count: 0 };
}

export async function getPromptTopCompetitorMentions(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	limit: number,
): Promise<TopCompetitorMention[]> {
	// Old query did `count(DISTINCT pr.id)` to count runs that mentioned the
	// competitor (not total mention occurrences). The aggregate's
	// `mention_count` is per-(prompt, hour, model, competitor_name); summing
	// it across the window gives the same count of runs that mentioned the
	// competitor (each run contributes 1 to its bucket per competitor name).
	const rows = await queryPg<TopCompetitorMention>(sql`
		SELECT
			competitor_name,
			sum(mention_count)::int AS mention_count
		FROM hourly_prompt_run_competitors
		WHERE prompt_id = ${promptId}
			${hourFilter(fromDate, toDate, timezone)}
		GROUP BY competitor_name
		ORDER BY mention_count DESC
		LIMIT ${limit}
	`);
	return rows;
}

// ============================================================================
// Daily Citation Stats
// ============================================================================

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
			(hour AT TIME ZONE ${timezone})::date AS date,
			domain,
			sum(count)::int AS count
		FROM hourly_citations
		WHERE brand_id = ${brandId}
			${hourFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY date, domain
		ORDER BY date
	`);
	return rows;
}

// ============================================================================
// Per-Prompt Daily Citation Stats (for LVCF smoothing)
// ============================================================================

export interface PerPromptDailyCitationStats {
	prompt_id: string;
	date: string;
	domain: string;
	count: number;
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
			(hour AT TIME ZONE ${timezone})::date AS date,
			domain,
			sum(count)::int AS count
		FROM hourly_citations
		WHERE brand_id = ${brandId}
			${hourFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id, date, domain
		ORDER BY prompt_id, date
	`);
	return rows;
}

// ============================================================================
// Brand Data Age
// ============================================================================

export async function getBrandEarliestRunDate(
	brandId: string,
): Promise<string | null> {
	const rows = await queryPg<{ earliest_date: string | null }>(sql`
		SELECT min(first_run_at) AS earliest_date
		FROM hourly_prompt_runs
		WHERE brand_id = ${brandId}
	`);
	return rows[0]?.earliest_date || null;
}

// ============================================================================
// Batch Chart Data
// ============================================================================

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

	// `webSearchEnabled` filter is honored on prompt_runs aggregate but not on
	// the competitor aggregate (we don't carry that dimension on
	// `hourly_prompt_run_competitors` — see getPromptCompetitorDailyStats).
	void webSearchEnabled;
	const [brandData, competitorData] = await Promise.all([
		queryPg<{
			prompt_id: string;
			date: string;
			total_runs: number;
			brand_mentioned_count: number;
		}>(sql`
			SELECT
				prompt_id,
				(hour AT TIME ZONE ${timezone})::date AS date,
				sum(total_runs)::int AS total_runs,
				sum(brand_mentioned_count)::int AS brand_mentioned_count
			FROM hourly_prompt_runs
			WHERE brand_id = ${brandId}
				AND prompt_id IN (${uuidList(promptIds)})
				${hourFilter(fromDate, toDate, timezone)}
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
				(hour AT TIME ZONE ${timezone})::date AS date,
				competitor_name,
				sum(mention_count)::int AS mention_count
			FROM hourly_prompt_run_competitors
			WHERE brand_id = ${brandId}
				AND prompt_id IN (${uuidList(promptIds)})
				${hourFilter(fromDate, toDate, timezone)}
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

// ============================================================================
// Batch Visibility Data
// ============================================================================

export async function getBatchVisibilityData(
	brandId: string,
	promptIds: string[],
	brandedPromptIds: string[],
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
): Promise<BatchVisibilityData> {
	if (promptIds.length === 0) {
		return { visibilityTimeSeries: [], totalRuns: 0, totalMentioned: 0 };
	}

	const isBranded = brandedPromptIds.length > 0
		? sql`(prompt_id IN (${uuidList(brandedPromptIds)}))`
		: sql`FALSE`;
	const result = await queryPg<{
		date: string;
		total_runs: number;
		brand_mentioned_count: number;
		is_branded: boolean;
	}>(sql`
		SELECT
			(hour AT TIME ZONE ${timezone})::date AS date,
			sum(total_runs)::int AS total_runs,
			sum(brand_mentioned_count)::int AS brand_mentioned_count,
			${isBranded} AS is_branded
		FROM hourly_prompt_runs
		WHERE brand_id = ${brandId}
			AND prompt_id IN (${uuidList(promptIds)})
			${hourFilter(fromDate, toDate, timezone)}
		GROUP BY date, is_branded
		ORDER BY date
	`);

	let totalRuns = 0;
	let totalMentioned = 0;
	for (const row of result) {
		totalRuns += Number(row.total_runs);
		totalMentioned += Number(row.brand_mentioned_count);
	}

	return { visibilityTimeSeries: result, totalRuns, totalMentioned };
}

// ============================================================================
// Admin Stats
// ============================================================================

export async function getAdminRunsOverTime(): Promise<AdminRunsOverTime[]> {
	const rows = await queryPg<AdminRunsOverTime>(sql`
		SELECT
			(created_at AT TIME ZONE 'UTC')::date AS date,
			count(*)::int AS count
		FROM prompt_runs
		WHERE created_at >= now() - interval '30 days'
		GROUP BY date
		ORDER BY date
	`);
	return rows;
}

export async function getAdminBrandRunStats(): Promise<AdminBrandRunStats[]> {
	const rows = await queryPg<AdminBrandRunStats>(sql`
		SELECT
			brand_id,
			count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS runs_7d,
			count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS runs_30d,
			to_char(max(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z' AS last_run_at
		FROM prompt_runs
		GROUP BY brand_id
	`);
	return rows;
}

export async function getAdminActiveBrandsOverTime(): Promise<AdminActiveBrandsOverTime[]> {
	const rows = await queryPg<AdminActiveBrandsOverTime>(sql`
		SELECT
			target_date AS date,
			count(DISTINCT brand_id)::int AS count
		FROM (
			SELECT
				brand_id,
				(created_at AT TIME ZONE 'UTC')::date + d AS target_date
			FROM prompt_runs,
				generate_series(0, 29) AS d
			WHERE created_at >= now() - interval '60 days'
		) expanded
		WHERE target_date >= current_date - 30
			AND target_date <= current_date
		GROUP BY target_date
		ORDER BY target_date
	`);
	return rows;
}

