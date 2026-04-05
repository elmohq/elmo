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
	engine: string;
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

function uuidList(ids: string[]): SQL {
	return sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
}

function promptIdFilter(enabledPromptIds?: string[]): SQL {
	if (!enabledPromptIds?.length) return sql``;
	return sql`AND prompt_id IN (${uuidList(enabledPromptIds)})`;
}

function modelFilter(model?: string): SQL {
	if (!model) return sql``;
	return sql`AND engine = ${model}`;
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
			count(*)::int AS total_runs,
			round(count(*) FILTER (WHERE brand_mentioned) * 100.0 / NULLIF(count(*), 0), 0)::int AS avg_visibility,
			round(count(*) FILTER (WHERE brand_mentioned) * 100.0 / NULLIF(count(*), 0), 0)::int AS non_branded_visibility,
			to_char(max(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z' AS last_updated
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
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
			(created_at AT TIME ZONE ${timezone})::date AS date,
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id, date
		ORDER BY prompt_id, date
	`);
	return rows;
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
			(created_at AT TIME ZONE ${timezone})::date AS date,
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count,
			${isBranded} AS is_branded
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
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
			min(created_at) AT TIME ZONE 'UTC' AS first_evaluated_at
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
			round(count(*) FILTER (WHERE brand_mentioned) * 100.0 / NULLIF(count(*), 0), 0)::int AS brand_mention_rate,
			round(count(*) FILTER (WHERE array_length(competitors_mentioned, 1) > 0) * 100.0 / NULLIF(count(*), 0), 0)::int AS competitor_mention_rate,
			(count(*) FILTER (WHERE brand_mentioned) * 2 + COALESCE(sum(array_length(competitors_mentioned, 1)), 0))::int AS total_weighted_mentions,
			max((created_at AT TIME ZONE ${timezone})::date) AS last_run_date
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
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
			(created_at AT TIME ZONE ${timezone})::date AS date,
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
		FROM prompt_runs
		WHERE prompt_id = ${promptId}
			${dateFilter(fromDate, toDate, timezone)}
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
	const rows = await queryPg<PromptCompetitorDailyStats>(sql`
		SELECT
			(created_at AT TIME ZONE ${timezone})::date AS date,
			competitor_name,
			count(*)::int AS mention_count
		FROM prompt_runs, unnest(competitors_mentioned) AS competitor_name
		WHERE prompt_id = ${promptId}
			${dateFilter(fromDate, toDate, timezone)}
			${webSearchFilter(webSearchEnabled)}
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
			engine,
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
	engine: string;
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
			engine,
			web_query,
			count(*)::int AS query_count
		FROM prompt_runs, unnest(web_queries) AS web_query
		WHERE prompt_id = ${promptId}
			AND array_length(web_queries, 1) > 0
			${dateFilter(fromDate, toDate, timezone)}
			${modelFilter(model)}
		GROUP BY engine, web_query
		ORDER BY engine, query_count DESC
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
	const rows = await queryPg<CitationDomainStats>(sql`
		SELECT
			domain,
			count(*)::int AS count,
			(array_agg(title) FILTER (WHERE title IS NOT NULL))[1] AS example_title
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= (${fromDate}::date AT TIME ZONE ${timezone})
			AND created_at < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY domain
		ORDER BY count DESC
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
	const rows = await queryPg<CitationUrlStats>(sql`
		SELECT
			url,
			domain,
			(array_agg(title) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count,
			round(avg(citation_index)::numeric, 1)::float AS avg_position,
			count(DISTINCT prompt_id)::int AS prompt_count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= (${fromDate}::date AT TIME ZONE ${timezone})
			AND created_at < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})
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
		SELECT
			domain,
			count(*)::int AS count,
			(array_agg(title) FILTER (WHERE title IS NOT NULL))[1] AS example_title
		FROM citations
		WHERE prompt_id = ${promptId}
			AND created_at >= (${fromDate}::date AT TIME ZONE ${timezone})
			AND created_at < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})
		GROUP BY domain
		ORDER BY count DESC
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
			(array_agg(title) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count,
			round(avg(citation_index)::numeric, 1)::float AS avg_position,
			count(DISTINCT prompt_id)::int AS prompt_count
		FROM citations
		WHERE prompt_id = ${promptId}
			AND created_at >= (${fromDate}::date AT TIME ZONE ${timezone})
			AND created_at < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})
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
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count,
			COALESCE(sum(array_length(competitors_mentioned, 1)), 0)::int AS competitor_mentioned_count
		FROM prompt_runs
		WHERE prompt_id = ${promptId}
			AND created_at >= (${fromDate}::date AT TIME ZONE ${timezone})
			AND created_at < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})
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
	const rows = await queryPg<TopCompetitorMention>(sql`
		SELECT
			competitor_name,
			count(DISTINCT pr.id)::int AS mention_count
		FROM prompt_runs pr, unnest(pr.competitors_mentioned) AS competitor_name
		WHERE pr.prompt_id = ${promptId}
			AND pr.created_at >= (${fromDate}::date AT TIME ZONE ${timezone})
			AND pr.created_at < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})
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
			(created_at AT TIME ZONE ${timezone})::date AS date,
			domain,
			count(*)::int AS count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= (${fromDate}::date AT TIME ZONE ${timezone})
			AND created_at < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})
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
			(created_at AT TIME ZONE ${timezone})::date AS date,
			domain,
			count(*)::int AS count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= (${fromDate}::date AT TIME ZONE ${timezone})
			AND created_at < ((${toDate}::date + interval '1 day') AT TIME ZONE ${timezone})
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
		SELECT min(created_at) AS earliest_date
		FROM prompt_runs
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
			(created_at AT TIME ZONE ${timezone})::date AS date,
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count,
			${isBranded} AS is_branded
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			AND prompt_id IN (${uuidList(promptIds)})
			${dateFilter(fromDate, toDate, timezone)}
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

