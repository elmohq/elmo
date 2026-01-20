// Tinybird read client v2 - optimized for new sorting key
// 
// Key improvements over v1:
// 1. Table has sorting key: brand_id, prompt_id, toDate(created_at), id
//    - Queries filter by brand_id/prompt_id first, using the index
// 2. FINAL is still used for deduplication, but now it's fast because:
//    - Only rows matching the WHERE clause are scanned
//    - Data is physically co-located by brand_id, prompt_id
// 3. Date filtering uses UTC bounds for index efficiency, timezone conversion in SELECT/GROUP BY
//
// Docs: https://www.tinybird.co/docs/forward/work-with-data/publish-data/guides/connect-clickhouse-js

import { createClient, type ClickHouseClient } from "@clickhouse/client";

// Lazy initialization to avoid errors when env vars are not set
let client: ClickHouseClient | null = null;

/**
 * Get the ClickHouse URL for Tinybird
 * 
 * For hosted Tinybird, derives ClickHouse URL from API URL:
 * API URL: https://api.us-west-2.aws.tinybird.co
 * ClickHouse URL: https://clickhouse.us-west-2.aws.tinybird.co
 * 
 * For Tinybird Local (docker), use CLICKHOUSE_HOST directly since
 * the URL transformation doesn't apply.
 */
function getClickHouseUrl(): string {
	// Allow direct override for Tinybird Local
	if (process.env.CLICKHOUSE_HOST) {
		return process.env.CLICKHOUSE_HOST;
	}
	const baseUrl = process.env.TINYBIRD_BASE_URL || "https://api.tinybird.co";
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
	return result.json<T>();
}

// ============================================================================
// Helper: Convert local date range to UTC timestamps for efficient filtering
// ============================================================================

/**
 * Convert a local date string to UTC start/end timestamps for that day.
 * This allows ClickHouse to use the sorting key index for date filtering.
 * 
 * Example: "2024-01-15" in "America/New_York" becomes:
 * - startUtc: "2024-01-15 05:00:00" (midnight EST in UTC)
 * - endUtc: "2024-01-16 04:59:59.999" (end of day EST in UTC)
 */
// Note: For simplicity, we still use the timezone-aware filtering approach
// since ClickHouse 23+ optimizes toDate(col, tz) well when col is in sorting key

// ============================================================================
// Dashboard Summary Query
// ============================================================================

export interface DashboardSummary {
	total_prompts: number;
	total_runs: number;
	avg_visibility: number;
	non_branded_visibility: number;
	last_updated: string | null;
}

/**
 * Get dashboard summary metrics from Tinybird v2 table
 */
export async function getDashboardSummary(
	brandId: string,
	fromDate: string | null, // 'YYYY-MM-DD' or null for all time
	toDate: string | null, // 'YYYY-MM-DD' or null for all time
	timezone: string,
	enabledPromptIds?: string[],
): Promise<DashboardSummary[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	return queryTinybird<DashboardSummary>(
		`
		SELECT
			uniqExact(prompt_id) as total_prompts,
			count() as total_runs,
			round(sum(brand_mentioned) * 100.0 / count(), 0) as avg_visibility,
			round(sum(brand_mentioned) * 100.0 / count(), 0) as non_branded_visibility,
			formatDateTime(max(created_at), '%Y-%m-%dT%H:%i:%S', 'UTC') || '.000Z' as last_updated
		FROM prompt_runs_v2 FINAL
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

// ============================================================================
// Visibility Time Series
// ============================================================================

export interface VisibilityTimeSeriesPoint {
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
	is_branded: boolean;
}

/**
 * Get daily visibility data for time series
 */
export async function getVisibilityTimeSeries(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	brandedPromptIds: string[],
	enabledPromptIds?: string[],
): Promise<VisibilityTimeSeriesPoint[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	return queryTinybird<VisibilityTimeSeriesPoint>(
		`
		SELECT
			toDate(created_at, {timezone:String}) as date,
			count() as total_runs,
			sum(brand_mentioned) as brand_mentioned_count,
			has({brandedPromptIds:Array(String)}, prompt_id) as is_branded
		FROM prompt_runs_v2 FINAL
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
// Prompts Summary
// ============================================================================

export interface PromptSummary {
	prompt_id: string;
	total_runs: number;
	brand_mention_rate: number;
	competitor_mention_rate: number;
	total_weighted_mentions: number;
	last_run_date: string | null;
}

/**
 * Get summary stats for all prompts
 */
export async function getPromptsSummary(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	modelGroup?: string,
	enabledPromptIds?: string[],
): Promise<PromptSummary[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const webSearchFilter = webSearchEnabled !== undefined ? `AND web_search_enabled = {webSearchEnabled:UInt8}` : "";
	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";
	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	return queryTinybird<PromptSummary>(
		`
		SELECT
			prompt_id,
			count() as total_runs,
			round(sum(brand_mentioned) * 100.0 / count(), 0) as brand_mention_rate,
			round(sum(has_competitor_mention) * 100.0 / count(), 0) as competitor_mention_rate,
			sum(brand_mentioned * 2 + competitor_count) as total_weighted_mentions,
			max(toDate(created_at, {timezone:String})) as last_run_date
		FROM prompt_runs_v2 FINAL
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
// Prompt Daily Stats (for chart data)
// ============================================================================

export interface PromptDailyStats {
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
}

/**
 * Get prompt-level daily stats (brand visibility only, aggregated across models)
 */
export async function getPromptDailyStats(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	modelGroup?: string,
): Promise<PromptDailyStats[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const webSearchFilter = webSearchEnabled !== undefined ? `AND web_search_enabled = {webSearchEnabled:UInt8}` : "";
	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	return queryTinybird<PromptDailyStats>(
		`
		SELECT
			toDate(created_at, {timezone:String}) as date,
			count() as total_runs,
			sum(brand_mentioned) as brand_mentioned_count
		FROM prompt_runs_v2 FINAL
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

// ============================================================================
// Prompt Competitor Daily Stats
// ============================================================================

export interface PromptCompetitorDailyStats {
	date: string;
	competitor_name: string;
	mention_count: number;
}

/**
 * Get per-competitor daily mention counts
 */
export async function getPromptCompetitorDailyStats(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled?: boolean,
	modelGroup?: string,
): Promise<PromptCompetitorDailyStats[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	const webSearchFilter = webSearchEnabled !== undefined ? `AND web_search_enabled = {webSearchEnabled:UInt8}` : "";
	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	return queryTinybird<PromptCompetitorDailyStats>(
		`
		SELECT
			toDate(created_at, {timezone:String}) as date,
			competitor_name,
			count() as mention_count
		FROM prompt_runs_v2 FINAL
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

// ============================================================================
// Web Queries for Mapping
// ============================================================================

export interface WebQueryMapping {
	model_group: string;
	web_query: string;
	created_at_iso: string;
}

/**
 * Get web queries for a prompt with timestamps for mapping
 */
export async function getPromptWebQueriesForMapping(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
): Promise<WebQueryMapping[]> {
	const dateFilter =
		fromDate && toDate
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

	return queryTinybird<WebQueryMapping>(
		`
		SELECT
			model_group,
			arrayJoin(web_queries) as web_query,
			formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S', 'UTC') || '.000Z' as created_at_iso
		FROM prompt_runs_v2 FINAL
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

// ============================================================================
// Citation Stats (Domain Level)
// ============================================================================

export interface CitationDomainStats {
	domain: string;
	count: number;
	example_title: string | null;
}

/**
 * Get citation domain distribution
 */
export async function getCitationDomainStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	modelGroup?: string,
): Promise<CitationDomainStats[]> {
	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";
	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	return queryTinybird<CitationDomainStats>(
		`
		SELECT
			domain,
			count() as count,
			any(title) as example_title
		FROM citations_v2 FINAL
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
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
			...(modelGroup ? { modelGroup } : {}),
		},
	);
}

// ============================================================================
// Citation Stats (URL Level)
// ============================================================================

export interface CitationUrlStats {
	url: string;
	domain: string;
	title: string | null;
	count: number;
}

/**
 * Get citation URL distribution
 */
export async function getCitationUrlStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	modelGroup?: string,
): Promise<CitationUrlStats[]> {
	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";
	const modelGroupFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

	return queryTinybird<CitationUrlStats>(
		`
		SELECT
			url,
			domain,
			any(title) as title,
			count() as count
		FROM citations_v2 FINAL
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
			...(enabledPromptIds?.length ? { enabledPromptIds } : {}),
			...(modelGroup ? { modelGroup } : {}),
		},
	);
}

// ============================================================================
// Prompt-Level Citation Stats
// ============================================================================

/**
 * Get citation domain stats for a specific prompt
 */
export async function getPromptCitationStats(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<CitationDomainStats[]> {
	return queryTinybird<CitationDomainStats>(
		`
		SELECT
			domain,
			count() as count,
			any(title) as example_title
		FROM citations_v2 FINAL
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
 * Get citation URL stats for a specific prompt
 */
export async function getPromptCitationUrlStats(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
): Promise<CitationUrlStats[]> {
	return queryTinybird<CitationUrlStats>(
		`
		SELECT
			url,
			domain,
			any(title) as title,
			count() as count
		FROM citations_v2 FINAL
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

export interface DailyCitationStats {
	date: string;
	domain: string;
	count: number;
}

/**
 * Get daily citation counts by domain for time series
 */
export async function getDailyCitationStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
): Promise<DailyCitationStats[]> {
	const promptFilter = enabledPromptIds?.length
		? `AND prompt_id IN {enabledPromptIds:Array(String)}`
		: "";

	return queryTinybird<DailyCitationStats>(
		`
		SELECT
			toDate(created_at, {timezone:String}) as date,
			domain,
			count() as count
		FROM citations_v2 FINAL
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
// Brand Data Age Query
// ============================================================================

/**
 * Get the earliest prompt run date for a brand
 * Used to determine if the brand has more than 1 week of data history
 * 
 * Note: No FINAL needed here because min() is idempotent - duplicates
 * would have the same or later created_at, so min() returns correct result.
 */
export async function getBrandEarliestRunDate(
	brandId: string,
): Promise<string | null> {
	const result = await queryTinybird<{ earliest_date: string | null }>(
		`
		SELECT
			min(created_at) as earliest_date
		FROM prompt_runs_v2
		WHERE brand_id = {brandId:String}
		`,
		{ brandId },
	);

	return result[0]?.earliest_date || null;
}

// ============================================================================
// Admin Stats Queries
// ============================================================================

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

/**
 * Get runs over time for the last 30 days (for admin dashboard chart)
 * 
 * Note: Uses FINAL for accurate counts. On freshly backfilled data this
 * may be slow until background merges complete.
 */
export async function getAdminRunsOverTime(): Promise<AdminRunsOverTime[]> {
	return queryTinybird<AdminRunsOverTime>(
		`
		SELECT
			toDate(created_at, 'UTC') as date,
			count() as count
		FROM prompt_runs_v2 FINAL
		WHERE created_at >= now() - INTERVAL 30 DAY
		GROUP BY date
		ORDER BY date
		`,
	);
}

/**
 * Get per-brand run stats (7d, 30d counts and last run) for admin dashboard
 */
export async function getAdminBrandRunStats(): Promise<AdminBrandRunStats[]> {
	return queryTinybird<AdminBrandRunStats>(
		`
		SELECT
			brand_id,
			countIf(created_at >= now() - INTERVAL 7 DAY) as runs_7d,
			countIf(created_at >= now() - INTERVAL 30 DAY) as runs_30d,
			formatDateTime(max(created_at), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') as last_run_at
		FROM prompt_runs_v2 FINAL
		GROUP BY brand_id
		`,
	);
}

// ============================================================================
// Connection Test
// ============================================================================

export interface ConnectionTest {
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
 * Test the ClickHouse/Tinybird connection
 */
export async function testConnection(): Promise<ConnectionTest> {
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

