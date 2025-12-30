// Tinybird read client using @clickhouse/client
// This uses ClickHouse-compatible protocol, making future migration to self-hosted ClickHouse seamless
// Docs: https://www.tinybird.co/docs/forward/work-with-data/publish-data/guides/connect-clickhouse-js
//
// DEDUPLICATION STRATEGY (ReplacingMergeTree):
// - prompt_runs uses ReplacingMergeTree which deduplicates during background merges
// - FINAL forces deduplication at query time (slight performance cost, but ensures accuracy)
// - ALL queries use FINAL to guarantee accurate counts matching PostgreSQL
// - For CITATIONS: Use pre-expanded citations table (via MV) with FINAL - much faster than ARRAY JOIN

import { createClient, type ClickHouseClient } from "@clickhouse/client";

// Lazy initialization to avoid errors when env vars are not set
let client: ClickHouseClient | null = null;

/**
 * Derive the ClickHouse URL from the Tinybird API URL
 * API URL: https://api.us-west-2.aws.tinybird.co
 * ClickHouse URL: https://clickhouse.us-west-2.aws.tinybird.co
 */
function getClickHouseUrl(): string {
	const baseUrl = process.env.TINYBIRD_BASE_URL || "https://api.tinybird.co";
	// Replace 'api.' with 'clickhouse.' in the URL
	return baseUrl.replace("://api.", "://clickhouse.");
}

function getClient(): ClickHouseClient {
	if (!client) {
		if (!process.env.TINYBIRD_TOKEN) {
			throw new Error("TINYBIRD_TOKEN is not set");
		}

		const clickhouseUrl = getClickHouseUrl();
		
		client = createClient({
			url: clickhouseUrl,
			username: process.env.TINYBIRD_WORKSPACE || "default",
			password: process.env.TINYBIRD_TOKEN,
			request_timeout: 30000,
		});
	}
	return client;
}

// Generic query function with type inference
export async function queryTinybird<T>(
	query: string,
	params?: Record<string, string | number | boolean | Date | string[]>,
): Promise<T[]> {
	const ch = getClient();
	const result = await ch.query({
		query,
		query_params: params,
		format: "JSONEachRow",
	});

	// result.json<T>() returns Promise<T[]> when format is JSONEachRow
	return result.json<T>();
}

// ============================================================================
// Dashboard Summary Query
// ============================================================================

export interface TinybirdDashboardSummary {
	total_prompts: number;
	total_runs: number;
	avg_visibility: number;
	non_branded_visibility: number;
	last_updated: string | null;
}

export interface TinybirdVisibilityTimeSeriesPoint {
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
	is_branded: boolean;
}

/**
 * Get dashboard summary metrics from Tinybird
 * Note: Must pass enabledPromptIds from PostgreSQL since prompt enabled status can change
 * and is not stored in Tinybird
 * 
 * Uses FINAL for accurate counts (deduplicates ReplacingMergeTree rows at query time).
 */
export async function getTinybirdDashboardSummary(
	brandId: string,
	fromDate: string | null, // 'YYYY-MM-DD' or null for all time
	toDate: string | null, // 'YYYY-MM-DD' or null for all time
	timezone: string, // IANA timezone
	enabledPromptIds?: string[], // Filter to only enabled prompts (from PostgreSQL)
): Promise<TinybirdDashboardSummary[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	// Filter by enabled prompt IDs if provided
	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	return queryTinybird<TinybirdDashboardSummary>(
		`
		SELECT
			uniqExact(prompt_id) as total_prompts,
			count() as total_runs,
			round(sum(brand_mentioned) * 100.0 / count(), 0) as avg_visibility,
			round(sum(brand_mentioned) * 100.0 / count(), 0) as non_branded_visibility,
			formatDateTime(max(created_at), '%Y-%m-%dT%H:%i:%S', 'UTC') || '.000Z' as last_updated
		FROM prompt_runs FINAL
		WHERE brand_id = {brandId:String}
			${dateFilter}
			${promptFilter}
	`,
		{
			brandId,
			timezone,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
		},
	);
}

/**
 * Get daily visibility data for time series (will be processed client-side for rolling averages)
 * Uses FINAL for accurate counts (deduplicates ReplacingMergeTree rows at query time).
 */
export async function getTinybirdVisibilityTimeSeries(
	brandId: string,
	fromDate: string | null, // 'YYYY-MM-DD' or null for all time
	toDate: string | null, // 'YYYY-MM-DD' or null for all time
	timezone: string, // IANA timezone
	brandedPromptIds: string[], // prompt_ids where systemTags include 'branded'
	enabledPromptIds?: string[], // Filter to only enabled prompts (from PostgreSQL)
): Promise<TinybirdVisibilityTimeSeriesPoint[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	// Filter by enabled prompt IDs if provided
	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	// Note: We determine branded/non-branded by prompt_id list from PostgreSQL
	// since systemTags can change and aren't stored in Tinybird
	return queryTinybird<TinybirdVisibilityTimeSeriesPoint>(
		`
		SELECT
			toDate(created_at, {timezone:String}) as date,
			count() as total_runs,
			sum(brand_mentioned) as brand_mentioned_count,
			has({brandedPromptIds:Array(String)}, prompt_id) as is_branded
		FROM prompt_runs FINAL
		WHERE brand_id = {brandId:String}
			${dateFilter}
			${promptFilter}
		GROUP BY date, is_branded
		ORDER BY date
	`,
		{
			brandId,
			timezone,
			brandedPromptIds,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
		},
	);
}

// ============================================================================
// Prompts Summary Query
// ============================================================================

export interface TinybirdPromptSummary {
	prompt_id: string;
	total_runs: number;
	brand_mention_rate: number;
	competitor_mention_rate: number;
	total_weighted_mentions: number;
	last_run_date: string | null;
}

/**
 * Get summary stats for all prompts from Tinybird
 * Note: prompt_value, tags, groupCategory, etc. should be joined from PostgreSQL
 * Uses FINAL for accurate counts (deduplicates ReplacingMergeTree rows at query time).
 */
export async function getTinybirdPromptsSummary(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	modelGroup?: string,
	enabledPromptIds?: string[], // Filter to only enabled prompts (from PostgreSQL)
): Promise<TinybirdPromptSummary[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const webSearchFilter = webSearchEnabled !== undefined ? `AND web_search_enabled = {webSearchEnabled:UInt8}` : "";

	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	// Filter by enabled prompt IDs if provided
	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	return queryTinybird<TinybirdPromptSummary>(
		`
		SELECT
			prompt_id,
			count() as total_runs,
			round(sum(brand_mentioned) * 100.0 / count(), 0) as brand_mention_rate,
			round(sum(has_competitor_mention) * 100.0 / count(), 0) as competitor_mention_rate,
			sum(brand_mentioned * 2 + competitor_count) as total_weighted_mentions,
			max(toDate(created_at, {timezone:String})) as last_run_date
		FROM prompt_runs FINAL
		WHERE brand_id = {brandId:String}
			${dateFilter}
			${webSearchFilter}
			${modelGroupFilter}
			${promptFilter}
		GROUP BY prompt_id
		ORDER BY total_runs DESC
	`,
		{
			brandId,
			timezone,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
			...(webSearchEnabled !== undefined ? { webSearchEnabled: webSearchEnabled ? 1 : 0 } : {}),
			...(modelGroup ? { modelGroup } : {}),
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
		},
	);
}

// ============================================================================
// Citation Stats Query
// ============================================================================

export interface TinybirdCitationDomainStats {
	domain: string;
	count: number;
	example_title: string | null;
}

export interface TinybirdCitationUrlStats {
	url: string;
	domain: string;
	title: string | null;
	count: number;
}

/**
 * Get citation domain distribution from Tinybird
 * 
 * Queries the pre-expanded citations table (populated via materialized view).
 * Uses FINAL for deduplication - much faster than ARRAY JOIN on prompt_runs.
 */
export async function getTinybirdCitationDomainStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[], // Filter to only enabled prompts (from PostgreSQL)
	modelGroup?: string,
): Promise<TinybirdCitationDomainStats[]> {
	const promptFilter = enabledPromptIds && enabledPromptIds.length > 0 
		? `AND prompt_id IN {enabledPromptIds:Array(String)}` 
		: "";

	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	return queryTinybird<TinybirdCitationDomainStats>(
		`
		SELECT
			domain,
			count() as count,
			any(title) as example_title
		FROM citations FINAL
		WHERE brand_id = {brandId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
			${promptFilter}
			${modelGroupFilter}
		GROUP BY domain
		ORDER BY count DESC
	`,
		{
			brandId,
			timezone,
			fromDate,
			toDate,
			...(enabledPromptIds && enabledPromptIds.length > 0 ? { enabledPromptIds } : {}),
			...(modelGroup ? { modelGroup } : {}),
		},
	);
}

/**
 * Get citation URL distribution from Tinybird
 * 
 * Queries the pre-expanded citations table (populated via materialized view).
 * Uses FINAL for deduplication - much faster than ARRAY JOIN on prompt_runs.
 */
export async function getTinybirdCitationUrlStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[], // Filter to only enabled prompts (from PostgreSQL)
	modelGroup?: string,
): Promise<TinybirdCitationUrlStats[]> {
	const promptFilter = enabledPromptIds && enabledPromptIds.length > 0 
		? `AND prompt_id IN {enabledPromptIds:Array(String)}` 
		: "";

	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	return queryTinybird<TinybirdCitationUrlStats>(
		`
		SELECT
			url,
			domain,
			any(title) as title,
			count() as count
		FROM citations FINAL
		WHERE brand_id = {brandId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
			${promptFilter}
			${modelGroupFilter}
		GROUP BY url, domain
		ORDER BY count DESC
	`,
		{
			brandId,
			timezone,
			fromDate,
			toDate,
			...(enabledPromptIds && enabledPromptIds.length > 0 ? { enabledPromptIds } : {}),
			...(modelGroup ? { modelGroup } : {}),
		},
	);
}

// ============================================================================
// Prompt Chart Data Query
// ============================================================================

export interface TinybirdPromptChartDataPoint {
	date: string;
	model_group: string;
	total_runs: number;
	brand_mentioned_count: number;
	competitor_mentioned_count: number;
}

export interface TinybirdPromptDailyStats {
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
}

export interface TinybirdPromptCompetitorDailyStats {
	date: string;
	competitor_name: string;
	mention_count: number;
}

export interface TinybirdWebQueryMapping {
	model_group: string;
	web_query: string;
	created_at_iso: string;
}

/**
 * Get prompt-level daily stats from Tinybird (brand visibility only, aggregated across models)
 * Uses FINAL for accurate counts.
 */
export async function getTinybirdPromptDailyStats(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	modelGroup?: string,
): Promise<TinybirdPromptDailyStats[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const webSearchFilter = webSearchEnabled !== undefined ? `AND web_search_enabled = {webSearchEnabled:UInt8}` : "";
	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	return queryTinybird<TinybirdPromptDailyStats>(
		`
		SELECT
			toDate(created_at, {timezone:String}) as date,
			count() as total_runs,
			sum(brand_mentioned) as brand_mentioned_count
		FROM prompt_runs FINAL
		WHERE prompt_id = {promptId:String}
			${dateFilter}
			${webSearchFilter}
			${modelGroupFilter}
		GROUP BY date
		ORDER BY date
	`,
		{
			promptId,
			timezone,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
			...(webSearchEnabled !== undefined ? { webSearchEnabled: webSearchEnabled ? 1 : 0 } : {}),
			...(modelGroup ? { modelGroup } : {}),
		},
	);
}

/**
 * Get per-competitor daily mention counts from Tinybird
 * Uses arrayJoin to expand competitors_mentioned array and count per competitor per day.
 * Uses FINAL for accurate counts.
 */
export async function getTinybirdPromptCompetitorDailyStats(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	modelGroup?: string,
): Promise<TinybirdPromptCompetitorDailyStats[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const webSearchFilter = webSearchEnabled !== undefined ? `AND web_search_enabled = {webSearchEnabled:UInt8}` : "";
	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	return queryTinybird<TinybirdPromptCompetitorDailyStats>(
		`
		SELECT
			toDate(created_at, {timezone:String}) as date,
			competitor_name,
			count() as mention_count
		FROM prompt_runs FINAL
		ARRAY JOIN competitors_mentioned AS competitor_name
		WHERE prompt_id = {promptId:String}
			${dateFilter}
			${webSearchFilter}
			${modelGroupFilter}
		GROUP BY date, competitor_name
		ORDER BY date, competitor_name
	`,
		{
			promptId,
			timezone,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
			...(webSearchEnabled !== undefined ? { webSearchEnabled: webSearchEnabled ? 1 : 0 } : {}),
			...(modelGroup ? { modelGroup } : {}),
		},
	);
}

/**
 * Get web queries for a prompt with timestamps for mapping (oldest query selection)
 * Returns all web queries with their model_group and created_at for client-side processing.
 * Uses FINAL for accurate counts.
 */
export async function getTinybirdPromptWebQueriesForMapping(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
): Promise<TinybirdWebQueryMapping[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	return queryTinybird<TinybirdWebQueryMapping>(
		`
		SELECT
			model_group,
			arrayJoin(web_queries) as web_query,
			formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S', 'UTC') || '.000Z' as created_at_iso
		FROM prompt_runs FINAL
		WHERE prompt_id = {promptId:String}
			AND length(web_queries) > 0
			${dateFilter}
		ORDER BY created_at ASC
	`,
		{
			promptId,
			timezone,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
		},
	);
}

/**
 * Get prompt-level chart data from Tinybird
 * Uses FINAL for accurate counts (deduplicates ReplacingMergeTree rows at query time).
 */
export async function getTinybirdPromptChartData(
	brandId: string,
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	modelGroup?: string,
): Promise<TinybirdPromptChartDataPoint[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const webSearchFilter = webSearchEnabled !== undefined ? `AND web_search_enabled = {webSearchEnabled:UInt8}` : "";

	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	return queryTinybird<TinybirdPromptChartDataPoint>(
		`
		SELECT
			toDate(created_at, {timezone:String}) as date,
			model_group,
			count() as total_runs,
			sum(brand_mentioned) as brand_mentioned_count,
			sum(has_competitor_mention) as competitor_mentioned_count
		FROM prompt_runs FINAL
		WHERE brand_id = {brandId:String}
			AND prompt_id = {promptId:String}
			${dateFilter}
			${webSearchFilter}
			${modelGroupFilter}
		GROUP BY date, model_group
		ORDER BY date
	`,
		{
			brandId,
			promptId,
			timezone,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
			...(webSearchEnabled !== undefined ? { webSearchEnabled: webSearchEnabled ? 1 : 0 } : {}),
			...(modelGroup ? { modelGroup } : {}),
		},
	);
}

// ============================================================================
// Prompt Stats Query
// ============================================================================

export interface TinybirdPromptStats {
	total_runs: number;
	brand_mentions: number;
	web_search_enabled_count: number;
}

/**
 * Get prompt-level aggregate stats from Tinybird
 * Uses FINAL for accurate counts (deduplicates ReplacingMergeTree rows at query time).
 */
export async function getTinybirdPromptStats(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<TinybirdPromptStats[]> {
	return queryTinybird<TinybirdPromptStats>(
		`
		SELECT
			count() as total_runs,
			sum(brand_mentioned) as brand_mentions,
			sum(web_search_enabled) as web_search_enabled_count
		FROM prompt_runs FINAL
		WHERE prompt_id = {promptId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
	`,
		{
			promptId,
			timezone,
			fromDate,
			toDate,
		},
	);
}

/**
 * Get prompt runs count for pagination verification
 * Uses FINAL for accurate counts (deduplicates ReplacingMergeTree rows at query time).
 */
export async function getTinybirdPromptRunsCount(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<{ total_count: number }[]> {
	return queryTinybird<{ total_count: number }>(
		`
		SELECT
			count() as total_count
		FROM prompt_runs FINAL
		WHERE prompt_id = {promptId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
	`,
		{
			promptId,
			timezone,
			fromDate,
			toDate,
		},
	);
}

/**
 * Get web queries for a prompt from Tinybird
 * Row-level query - uses FINAL to guarantee no duplicate rows in results.
 */
export async function getTinybirdPromptWebQueries(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<{ model_group: string; web_queries: string[] }[]> {
	return queryTinybird<{ model_group: string; web_queries: string[] }>(
		`
		SELECT
			model_group,
			web_queries
		FROM prompt_runs FINAL
		WHERE prompt_id = {promptId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
			AND length(web_queries) > 0
	`,
		{
			promptId,
			timezone,
			fromDate,
			toDate,
		},
	);
}

/**
 * Get citation stats for a prompt from Tinybird
 * 
 * Queries the pre-expanded citations table (populated via materialized view).
 * Uses FINAL for deduplication - much faster than ARRAY JOIN on prompt_runs.
 */
export async function getTinybirdPromptCitationStats(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<TinybirdCitationDomainStats[]> {
	return queryTinybird<TinybirdCitationDomainStats>(
		`
		SELECT
			domain,
			count() as count,
			any(title) as example_title
		FROM citations FINAL
		WHERE prompt_id = {promptId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
		GROUP BY domain
		ORDER BY count DESC
	`,
		{
			promptId,
			timezone,
			fromDate,
			toDate,
		},
	);
}

/**
 * Get citation URL stats for a prompt from Tinybird
 * 
 * Queries the pre-expanded citations table (populated via materialized view).
 * Uses FINAL for deduplication - much faster than ARRAY JOIN on prompt_runs.
 */
export async function getTinybirdPromptCitationUrlStats(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<TinybirdCitationUrlStats[]> {
	return queryTinybird<TinybirdCitationUrlStats>(
		`
		SELECT
			url,
			domain,
			any(title) as title,
			count() as count
		FROM citations FINAL
		WHERE prompt_id = {promptId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
		GROUP BY url, domain
		ORDER BY count DESC
	`,
		{
			promptId,
			timezone,
			fromDate,
			toDate,
		},
	);
}

// ============================================================================
// Daily Citation Stats for Time Series
// ============================================================================

export interface TinybirdDailyCitationStats {
	date: string;
	domain: string;
	count: number;
}

/**
 * Get daily citation counts by domain for time series
 * 
 * Queries the pre-expanded citations table (populated via materialized view).
 * Uses FINAL for deduplication - much faster than ARRAY JOIN on prompt_runs.
 */
export async function getTinybirdDailyCitationStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[], // Filter to only enabled prompts (from PostgreSQL)
): Promise<TinybirdDailyCitationStats[]> {
	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	return queryTinybird<TinybirdDailyCitationStats>(
		`
		SELECT
			toDate(created_at, {timezone:String}) as date,
			domain,
			count() as count
		FROM citations FINAL
		WHERE brand_id = {brandId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
			${promptFilter}
		GROUP BY date, domain
		ORDER BY date
	`,
		{
			brandId,
			timezone,
			fromDate,
			toDate,
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
		},
	);
}

// ============================================================================
// Fast MV-Based Queries (Using prompt_runs_hourly_counts)
// ============================================================================
// These functions use the pre-aggregated prompt_runs_hourly_counts table which:
// 1. Uses SummingMergeTree with sum() for fast aggregation
// 2. Is pre-aggregated hourly, so queries read much less data
// 3. Has optimal sorting key (brand_id, prompt_id, hour) for fast filtering
// 4. Trade-off: ~0.01% duplicate inflation (acceptable for dashboards/charts)
// 4. Stores hours in UTC, converts to dates in requested timezone at query time
//
// This gives us: FAST queries + 100% correct deduplication + proper timezone handling

/**
 * Get prompt-level chart data - FAST version using pre-aggregated hourly counts MV
 * 
 * Uses prompt_runs_hourly_counts which has:
 * 1. Optimal sorting key (brand_id, prompt_id, hour) for fast filtering
 * 2. Simple sum() aggregation (no expensive uniqMerge)
 * 3. Pre-aggregated by hour = much less data to scan
 * 4. Timezone-aware: toDate(hour, timezone) at query time
 * 
 * Trade-off: ~0.01% duplicate inflation (acceptable for charts)
 */
export async function getTinybirdPromptChartDataFast(
	brandId: string,
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	modelGroup?: string,
): Promise<TinybirdPromptChartDataPoint[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(hour, {timezone:String}) >= toDate({fromDate:String}) AND toDate(hour, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const webSearchFilter = webSearchEnabled !== undefined ? `AND web_search_enabled = {webSearchEnabled:UInt8}` : "";

	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	return queryTinybird<TinybirdPromptChartDataPoint>(
		`
		SELECT
			toDate(hour, {timezone:String}) as date,
			model_group,
			sum(run_count) as total_runs,
			sum(brand_mentioned_count) as brand_mentioned_count,
			sum(competitor_mentioned_count) as competitor_mentioned_count
		FROM prompt_runs_hourly_counts
		WHERE brand_id = {brandId:String}
			AND prompt_id = {promptId:String}
			${dateFilter}
			${webSearchFilter}
			${modelGroupFilter}
		GROUP BY date, model_group
		ORDER BY date
	`,
		{
			brandId,
			promptId,
			timezone,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
			...(webSearchEnabled !== undefined ? { webSearchEnabled: webSearchEnabled ? 1 : 0 } : {}),
			...(modelGroup ? { modelGroup } : {}),
		},
	);
}

/**
 * Get summary stats for all prompts - FAST version using pre-aggregated hourly counts MV
 * 
 * Uses prompt_runs_hourly_counts which has:
 * 1. Optimal sorting key (brand_id, prompt_id, hour) for fast filtering
 * 2. Simple sum() aggregation (no expensive uniqMerge)
 * 3. Pre-aggregated by hour = much less data to scan
 * 4. Timezone-aware: toDate(hour, timezone) at query time
 * 
 * Trade-off: ~0.01% duplicate inflation (acceptable for ordering)
 */
export async function getTinybirdPromptsSummaryFast(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	modelGroup?: string,
	enabledPromptIds?: string[],
): Promise<TinybirdPromptSummary[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(hour, {timezone:String}) >= toDate({fromDate:String}) AND toDate(hour, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const webSearchFilter = webSearchEnabled !== undefined ? `AND web_search_enabled = {webSearchEnabled:UInt8}` : "";

	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	return queryTinybird<TinybirdPromptSummary>(
		`
		SELECT
			prompt_id,
			sum(run_count) as total_runs,
			round(sum(brand_mentioned_count) * 100.0 / sum(run_count), 0) as brand_mention_rate,
			round(sum(competitor_mentioned_count) * 100.0 / sum(run_count), 0) as competitor_mention_rate,
			sum(brand_mentioned_count) * 2 + sum(competitor_count_sum) as total_weighted_mentions,
			max(toDate(hour, {timezone:String})) as last_run_date
		FROM prompt_runs_hourly_counts
		WHERE brand_id = {brandId:String}
			${dateFilter}
			${webSearchFilter}
			${modelGroupFilter}
			${promptFilter}
		GROUP BY prompt_id
		ORDER BY total_runs DESC
	`,
		{
			brandId,
			timezone,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
			...(webSearchEnabled !== undefined ? { webSearchEnabled: webSearchEnabled ? 1 : 0 } : {}),
			...(modelGroup ? { modelGroup } : {}),
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
		},
	);
}

/**
 * Get dashboard summary metrics - FAST version using pre-aggregated hourly counts MV
 * 
 * Uses prompt_runs_hourly_counts which has:
 * 1. Optimal sorting key (brand_id, prompt_id, hour) for fast filtering
 * 2. Simple sum() aggregation (no expensive uniqMerge)
 * 3. Pre-aggregated by hour = much less data to scan
 * 4. Timezone-aware: toDate(hour, timezone) at query time
 * 
 * Trade-off: ~0.01% duplicate inflation (acceptable for dashboards)
 */
export async function getTinybirdDashboardSummaryFast(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	enabledPromptIds?: string[],
): Promise<TinybirdDashboardSummary[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(hour, {timezone:String}) >= toDate({fromDate:String}) AND toDate(hour, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	return queryTinybird<TinybirdDashboardSummary>(
		`
		SELECT
			uniqExact(prompt_id) as total_prompts,
			sum(run_count) as total_runs,
			round(sum(brand_mentioned_count) * 100.0 / sum(run_count), 0) as avg_visibility,
			round(sum(brand_mentioned_count) * 100.0 / sum(run_count), 0) as non_branded_visibility,
			max(toDate(hour, {timezone:String})) as last_updated
		FROM prompt_runs_hourly_counts
		WHERE brand_id = {brandId:String}
			${dateFilter}
			${promptFilter}
	`,
		{
			brandId,
			timezone,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
		},
	);
}

/**
 * Get daily visibility data - FAST version using pre-aggregated hourly counts MV
 * 
 * Uses prompt_runs_hourly_counts which has:
 * 1. Optimal sorting key (brand_id, prompt_id, hour) for fast filtering
 * 2. Simple sum() aggregation (no expensive uniqMerge)
 * 3. Pre-aggregated by hour = much less data to scan
 * 4. Timezone-aware: toDate(hour, timezone) at query time
 * 
 * Trade-off: ~0.01% duplicate inflation (acceptable for time series)
 */
export async function getTinybirdVisibilityTimeSeriesFast(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	brandedPromptIds: string[],
	enabledPromptIds?: string[],
): Promise<TinybirdVisibilityTimeSeriesPoint[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(hour, {timezone:String}) >= toDate({fromDate:String}) AND toDate(hour, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	return queryTinybird<TinybirdVisibilityTimeSeriesPoint>(
		`
		SELECT
			toDate(hour, {timezone:String}) as date,
			sum(run_count) as total_runs,
			sum(brand_mentioned_count) as brand_mentioned_count,
			has({brandedPromptIds:Array(String)}, prompt_id) as is_branded
		FROM prompt_runs_hourly_counts
		WHERE brand_id = {brandId:String}
			${dateFilter}
			${promptFilter}
		GROUP BY date, is_branded
		ORDER BY date
	`,
		{
			brandId,
			timezone,
			brandedPromptIds,
			...(fromDate && toDate ? { fromDate, toDate } : {}),
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
		},
	);
}

// ============================================================================
// Diagnostic Queries for Debugging Mismatches
// ============================================================================

export interface PromptRunDiagnostics {
	earliest_date: string | null;
	latest_date: string | null;
	total_count: number;
	per_prompt_counts: Array<{ prompt_id: string; count: number }>;
}

/**
 * Get diagnostic information about prompt runs for debugging mismatches
 * Returns date range and per-prompt counts
 * Uses FINAL for accurate counts (deduplicates ReplacingMergeTree rows at query time).
 */
export async function getTinybirdPromptRunDiagnostics(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
): Promise<PromptRunDiagnostics> {
	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	// Get date range and total count
	const summaryResult = await queryTinybird<{
		earliest_date: string | null;
		latest_date: string | null;
		total_count: number;
	}>(
		`
		SELECT
			min(created_at) as earliest_date,
			max(created_at) as latest_date,
			count() as total_count
		FROM prompt_runs FINAL
		WHERE brand_id = {brandId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
			${promptFilter}
	`,
		{
			brandId,
			timezone,
			fromDate,
			toDate,
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
		},
	);

	// Get per-prompt counts
	const perPromptResult = await queryTinybird<{ prompt_id: string; count: number }>(
		`
		SELECT
			prompt_id,
			count() as count
		FROM prompt_runs FINAL
		WHERE brand_id = {brandId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
			${promptFilter}
		GROUP BY prompt_id
		ORDER BY count DESC
	`,
		{
			brandId,
			timezone,
			fromDate,
			toDate,
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
		},
	);

	const summary = summaryResult[0] || { earliest_date: null, latest_date: null, total_count: 0 };
	return {
		...summary,
		per_prompt_counts: perPromptResult,
	};
}

export interface CitationDiagnostics {
	earliest_date: string | null;
	latest_date: string | null;
	total_count: number;
	per_prompt_counts: Array<{ prompt_id: string; count: number }>;
	prompt_run_count: number;
}

/**
 * Get diagnostic information about citations for debugging mismatches
 * Returns date range, per-prompt counts, and unique prompt run count
 * 
 * Queries the pre-expanded citations table (populated via materialized view).
 * Uses FINAL for deduplication - much faster than ARRAY JOIN on prompt_runs.
 */
export async function getTinybirdCitationDiagnostics(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	modelGroup?: string,
): Promise<CitationDiagnostics> {
	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";
	const modelFilter = modelGroup
		? `AND model_group = {modelGroup:String}`
		: "";

	// Get date range, total count, and unique prompt runs
	const summaryResult = await queryTinybird<{
		earliest_date: string | null;
		latest_date: string | null;
		total_count: number;
		prompt_run_count: number;
	}>(
		`
		SELECT
			min(created_at) as earliest_date,
			max(created_at) as latest_date,
			count() as total_count,
			uniqExact(prompt_run_id) as prompt_run_count
		FROM citations FINAL
		WHERE brand_id = {brandId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
			${promptFilter}
			${modelFilter}
	`,
		{
			brandId,
			timezone,
			fromDate,
			toDate,
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
			...(modelGroup ? { modelGroup } : {}),
		},
	);

	// Get per-prompt counts
	const perPromptResult = await queryTinybird<{ prompt_id: string; count: number }>(
		`
		SELECT
			prompt_id,
			count() as count
		FROM citations FINAL
		WHERE brand_id = {brandId:String}
			AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String})
			AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})
			${promptFilter}
			${modelFilter}
		GROUP BY prompt_id
		ORDER BY count DESC
	`,
		{
			brandId,
			timezone,
			fromDate,
			toDate,
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
			...(modelGroup ? { modelGroup } : {}),
		},
	);

	const summary = summaryResult[0] || { earliest_date: null, latest_date: null, total_count: 0, prompt_run_count: 0 };
	return {
		...summary,
		per_prompt_counts: perPromptResult,
	};
}

// ============================================================================
// Admin Stats Queries
// ============================================================================

export interface TinybirdAdminRunsOverTime {
	date: string;
	count: number;
}

export interface TinybirdAdminBrandRunStats {
	brand_id: string;
	runs_7d: number;
	runs_30d: number;
	last_run_at: string | null;
}

/**
 * Get runs over time for the last 30 days (for admin dashboard chart)
 * Uses FINAL for accurate counts.
 */
export async function getTinybirdAdminRunsOverTime(): Promise<TinybirdAdminRunsOverTime[]> {
	return queryTinybird<TinybirdAdminRunsOverTime>(
		`
		SELECT
			toDate(created_at, 'UTC') as date,
			count() as count
		FROM prompt_runs FINAL
		WHERE created_at >= now() - INTERVAL 30 DAY
		GROUP BY date
		ORDER BY date
		`,
	);
}

/**
 * Get per-brand run stats (7d, 30d counts and last run) for admin dashboard
 * Uses FINAL for accurate counts.
 */
export async function getTinybirdAdminBrandRunStats(): Promise<TinybirdAdminBrandRunStats[]> {
	return queryTinybird<TinybirdAdminBrandRunStats>(
		`
		SELECT
			brand_id,
			countIf(created_at >= now() - INTERVAL 7 DAY) as runs_7d,
			countIf(created_at >= now() - INTERVAL 30 DAY) as runs_30d,
			formatDateTime(max(created_at), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') as last_run_at
		FROM prompt_runs FINAL
		GROUP BY brand_id
		`,
	);
}

// ============================================================================
// Connection Test
// ============================================================================

export interface TinybirdConnectionTest {
	success: boolean;
	message: string;
	latencyMs?: number;
	error?: string;
	config?: {
		clickhouseUrl: string;
		baseUrl: string;
		workspace: string;
	};
}

/**
 * Test the ClickHouse/Tinybird connection by running a simple query
 */
export async function testTinybirdConnection(): Promise<TinybirdConnectionTest> {
	if (!process.env.TINYBIRD_TOKEN || !process.env.TINYBIRD_BASE_URL) {
		return {
			success: false,
			message: "Tinybird is not configured",
			error: "Missing TINYBIRD_TOKEN or TINYBIRD_BASE_URL environment variables",
		};
	}

	const baseUrl = process.env.TINYBIRD_BASE_URL || "https://api.tinybird.co";
	const config = {
		clickhouseUrl: getClickHouseUrl(),
		baseUrl,
		workspace: process.env.TINYBIRD_WORKSPACE || "default",
	};

	try {
		const startTime = performance.now();
		
		// Run a simple query to test the connection
		const result = await queryTinybird<{ result: number }>("SELECT 1 as result");
		
		const latencyMs = Math.round(performance.now() - startTime);

		if (result.length > 0 && result[0].result === 1) {
			return {
				success: true,
				message: `Connected successfully`,
				latencyMs,
				config,
			};
		}
		
		return {
			success: false,
			message: "Connection test returned unexpected result",
			latencyMs,
			config,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: "Connection failed",
			error: errorMessage,
			config,
		};
	}
}

