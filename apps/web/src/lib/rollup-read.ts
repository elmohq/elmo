/**
 * Postgres analytics read layer, backed by the rollup tables instead of raw
 * `prompt_runs`/`citations`. Same exported names, signatures, and return
 * shapes as `postgres-read.ts` — `analytics-read.ts` picks between the two
 * once the backfill has caught up.
 *
 * Window/filter helpers (`windowStart`, `windowEnd`, `uuidList`,
 * `promptIdFilter`, `modelFilter`, `webSearchFilter`, `queryPg`) are shared
 * with `postgres-read.ts` rather than duplicated: the rollup tables carry
 * `provider` and `web_search_enabled` on every row, so the same
 * `modelFilter` predicate that targets `prompt_runs`/`citations` works
 * unchanged here, and the citations `EXISTS`-against-`prompt_runs` branch is
 * never needed.
 */

import { type SQL, sql } from "drizzle-orm";
import {
	type BrandMentionTotals,
	type CitationDomainStats,
	type CitationUrlStats,
	type DailyCitationStats,
	type DashboardSummary,
	type ModelMentionRateRow,
	modelFilter,
	type PerPromptCitationPageRow,
	type PerPromptDailyCitationStats,
	type PerPromptDailyCompetitorRow,
	type PerPromptDailyMentionRow,
	type PerPromptRunStats,
	type PerPromptVisibilityPoint,
	type ProcessedBatchChartDataPoint,
	type PromptMentionSummary,
	type PromptSummary,
	promptIdFilter,
	queryPg,
	type TopCompetitorMention,
	uuidList,
	type VisibilityDailyAggregate,
	webSearchFilter,
	windowEnd,
	windowStart,
} from "@/lib/postgres-read";

/**
 * The predicate every rollup read shares: `bucket` is the rollup grain's
 * timestamp, so this is `dateFilter` from `postgres-read.ts` with `bucket` in
 * place of `created_at`. Returns a fresh fragment on every call — interpolate
 * it once per query site rather than storing and reusing the result.
 */
function rollupWindow(fromDate: string | null, toDate: string | null, timezone: string): SQL {
	if (!fromDate || !toDate) return sql``;
	return sql`AND bucket >= ${windowStart(fromDate, timezone)} AND bucket < ${windowEnd(toDate, timezone)}`;
}

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
			coalesce(sum(runs), 0)::int AS total_runs,
			round(sum(brand_mentioned_runs) * 100.0 / NULLIF(sum(runs), 0), 0)::int AS avg_visibility,
			round(sum(brand_mentioned_runs) * 100.0 / NULLIF(sum(runs), 0), 0)::int AS non_branded_visibility,
			to_char(max(last_run_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z' AS last_updated
		FROM rollup_prompt_runs
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
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
			(bucket AT TIME ZONE ${timezone})::date AS date,
			sum(runs)::int AS total_runs,
			sum(brand_mentioned_runs)::int AS brand_mentioned_count
		FROM rollup_prompt_runs
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id, date
		ORDER BY prompt_id, date
	`);
	return rows;
}

/**
 * Single-query replacement for `getPerPromptVisibilityTimeSeries` + JS
 * `applyPerPromptLVCF`, reading `rollup_prompt_runs` instead of `prompt_runs`.
 * Everything past the `observations` CTE (the date grid, the branded join,
 * the LVCF window functions, the final SELECT) is unchanged from
 * `postgres-read.ts` — the LVCF logic doesn't care whether an observation
 * came from one raw row or a bucket's worth of them.
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
					(bucket AT TIME ZONE ${timezone})::date AS obs_date,
					sum(runs)::int AS total_runs,
					sum(brand_mentioned_runs)::int AS brand_mentioned_count
				FROM rollup_prompt_runs
				WHERE brand_id = ${brandId}
					AND prompt_id IN (${uuidList(enabledPromptIds)})
					AND bucket >= ${windowStart(fromDate, timezone)}
					AND bucket < ${windowEnd(toDate, timezone)}
					${modelFilter(model)}
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
		SELECT coalesce(sum(citations), 0)::int AS total
		FROM rollup_citation_domains
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
	`);
	return Number(rows[0]?.total ?? 0);
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
			sum(runs)::int AS total_runs,
			(sum(brand_mentioned_runs)::float / NULLIF(sum(runs), 0)) AS brand_mention_rate,
			(sum(competitor_runs)::float / NULLIF(sum(runs), 0)) AS competitor_mention_rate,
			(sum(brand_mentioned_runs) * 2 + sum(competitor_mentions))::int AS total_weighted_mentions,
			(max(last_run_at) AT TIME ZONE ${timezone})::date AS last_run_date
		FROM rollup_prompt_runs
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${webSearchFilter(webSearchEnabled)}
			${modelFilter(model)}
			${promptIdFilter(enabledPromptIds)}
		GROUP BY prompt_id
		ORDER BY total_runs DESC
	`);
	return rows;
}

/**
 * `example_title` trades "most recently cited" (raw, ordered by `created_at`)
 * for "title of the most-cited page" (the lateral's `ORDER BY sum(citations)
 * DESC`): rollup rows don't carry per-citation timestamps, only bucket-grain
 * sums, so recency isn't reconstructable without reading individual citation
 * rows — which is what the rollup exists to avoid. `page_id` breaks ties
 * deterministically.
 */
export async function getCitationDomainStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<CitationDomainStats[]> {
	// A function, called once per query site (CTE, lateral), so each site gets
	// its own SQL parameters rather than sharing one interpolated fragment.
	const scope = () => sql`
		${rollupWindow(fromDate, toDate, timezone)}
		${promptIdFilter(enabledPromptIds)}
		${modelFilter(model)}
	`;
	const rows = await queryPg<CitationDomainStats>(sql`
		WITH domain_totals AS (
			SELECT domain, sum(citations)::int AS count
			FROM rollup_citation_domains
			WHERE brand_id = ${brandId} ${scope()}
			GROUP BY domain
		)
		SELECT
			dt.domain AS domain,
			dt.count AS count,
			top_page.title AS example_title
		FROM domain_totals dt
		LEFT JOIN LATERAL (
			SELECT cp.title
			FROM rollup_citation_urls rcu
			JOIN cited_pages cp ON cp.id = rcu.page_id
			WHERE rcu.brand_id = ${brandId} ${scope()} AND rcu.domain = dt.domain
			GROUP BY rcu.page_id, cp.title
			ORDER BY sum(rcu.citations) DESC, rcu.page_id ASC
			LIMIT 1
		) top_page ON true
		ORDER BY dt.count DESC
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
			cp.url AS url,
			cp.domain AS domain,
			cp.title AS title,
			sum(rcu.citations)::int AS count,
			round(sum(rcu.position_sum)::numeric / NULLIF(sum(rcu.position_count), 0), 1)::float AS avg_position,
			count(DISTINCT rcu.prompt_id)::int AS prompt_count
		FROM rollup_citation_urls rcu
		JOIN cited_pages cp ON cp.id = rcu.page_id
		WHERE rcu.brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY rcu.page_id, cp.url, cp.domain, cp.title
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
		FROM rollup_citation_domains
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
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
			cp.url AS url,
			cp.domain AS domain,
			cp.title AS title,
			sum(rcu.citations)::int AS count,
			round(sum(rcu.position_sum)::numeric / NULLIF(sum(rcu.position_count), 0), 1)::float AS avg_position,
			count(DISTINCT rcu.prompt_id)::int AS prompt_count
		FROM rollup_citation_urls rcu
		JOIN cited_pages cp ON cp.id = rcu.page_id
		WHERE rcu.prompt_id = ${promptId}
			${rollupWindow(fromDate, toDate, timezone)}
		GROUP BY rcu.page_id, cp.url, cp.domain, cp.title
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
			coalesce(sum(runs), 0)::int AS total_runs,
			coalesce(sum(brand_mentioned_runs), 0)::int AS brand_mentioned_count,
			coalesce(sum(competitor_mentions), 0)::int AS competitor_mentioned_count
		FROM rollup_prompt_runs
		WHERE prompt_id = ${promptId}
			${rollupWindow(fromDate, toDate, timezone)}
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
			sum(runs)::int AS mention_count
		FROM rollup_competitor_mentions
		WHERE prompt_id = ${promptId}
			${rollupWindow(fromDate, toDate, timezone)}
		GROUP BY competitor_name
		ORDER BY mention_count DESC
		LIMIT ${limit}
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
			(bucket AT TIME ZONE ${timezone})::date AS date,
			domain,
			sum(citations)::int AS count
		FROM rollup_citation_domains
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
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
			(bucket AT TIME ZONE ${timezone})::date AS date,
			domain,
			sum(citations)::int AS count
		FROM rollup_citation_domains
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
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
			sum(runs)::int AS runs,
			count(DISTINCT (bucket AT TIME ZONE ${timezone})::date)::int AS run_days,
			round((sum(brand_mentioned_runs)::float / NULLIF(sum(runs), 0))::numeric, 4)::float AS brand_mention_rate,
			round((sum(competitor_runs)::float / NULLIF(sum(runs), 0))::numeric, 4)::float AS competitor_mention_rate
		FROM rollup_prompt_runs
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
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
			coalesce(sum(runs), 0)::int AS total_runs,
			coalesce(sum(brand_mentioned_runs), 0)::int AS brand_mentioned_runs,
			count(DISTINCT prompt_id) FILTER (WHERE brand_mentioned_runs > 0)::int AS brand_mentioned_prompts
		FROM rollup_prompt_runs
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
	`);
	return rows[0] ?? { total_runs: 0, brand_mentioned_runs: 0, brand_mentioned_prompts: 0 };
}

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
			(bucket AT TIME ZONE ${timezone})::date::text AS date,
			sum(brand_mentioned_runs)::int AS brand_mentions,
			sum(competitor_mentions)::int AS competitor_mentions
		FROM rollup_prompt_runs
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id, date
		ORDER BY prompt_id, date
	`);
	return rows;
}

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
			(bucket AT TIME ZONE ${timezone})::date::text AS date,
			competitor_name AS competitor,
			sum(runs)::int AS mentions
		FROM rollup_competitor_mentions
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id, date, competitor
		ORDER BY prompt_id, date
	`);
	return rows;
}

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
			rcu.prompt_id AS prompt_id,
			cp.url AS url,
			cp.domain AS domain,
			cp.title AS title,
			sum(rcu.citations)::int AS count
		FROM rollup_citation_urls rcu
		JOIN cited_pages cp ON cp.id = rcu.page_id
		WHERE rcu.brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY rcu.prompt_id, rcu.page_id, cp.url, cp.domain, cp.title
		ORDER BY rcu.prompt_id, count DESC
	`);
	return rows;
}

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
			sum(runs)::int AS runs,
			sum(brand_mentioned_runs)::int AS brand_mentioned_count
		FROM rollup_prompt_runs
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model, { source: "prompt_runs" })}
		GROUP BY model
		ORDER BY runs DESC
	`);
	return rows;
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
				(bucket AT TIME ZONE ${timezone})::date AS date,
				sum(runs)::int AS total_runs,
				sum(brand_mentioned_runs)::int AS brand_mentioned_count
			FROM rollup_prompt_runs
			WHERE brand_id = ${brandId}
				AND prompt_id IN (${uuidList(promptIds)})
				${rollupWindow(fromDate, toDate, timezone)}
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
				(bucket AT TIME ZONE ${timezone})::date AS date,
				competitor_name,
				sum(runs)::int AS mention_count
			FROM rollup_competitor_mentions
			WHERE brand_id = ${brandId}
				AND prompt_id IN (${uuidList(promptIds)})
				${rollupWindow(fromDate, toDate, timezone)}
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

export interface CitationCountByModelRow {
	model: string;
	provider: string;
	web_search_enabled: boolean;
	count: number;
}

/**
 * Per-(model, provider, web_search_enabled) citation counts for the window —
 * one grouped query in place of `getBrandModelBreakdown`'s old per-model
 * `getCitationsTotalCount` loop. Callers split grounded vs standard in JS the
 * same way `modelFilter` does (`web_search_enabled AND provider IN
 * API_PROVIDER_IDS`), since which target a `ModelVisibility` row represents
 * isn't decidable here without re-deriving that logic.
 */
export async function getCitationsCountByModel(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
): Promise<CitationCountByModelRow[]> {
	const rows = await queryPg<CitationCountByModelRow>(sql`
		SELECT
			model,
			provider,
			web_search_enabled,
			sum(citations)::int AS count
		FROM rollup_citation_domains
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
		GROUP BY model, provider, web_search_enabled
	`);
	return rows;
}

export interface PerPromptDailyCitationClassRow {
	prompt_id: string;
	date: string;
	domain: string;
	static_category: string;
	page_type: string;
	count: number;
}

/**
 * Per (prompt, day, domain, static category, page type) citation counts —
 * replaces the per-URL `getPerPromptDailyCitationPages` as the source for the
 * citations page's category and page-type time series. `static_category` and
 * `page_type` are already denormalized onto `rollup_citation_urls` at rebuild
 * time (`classifyPage`), so this needs no `cited_pages` join and no per-URL
 * row leaves the database. Callers apply the brand/competitor domain override
 * on top of `static_category` (tenant-independent) to get the final category.
 */
export async function getPerPromptDailyCitationClasses(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<PerPromptDailyCitationClassRow[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptDailyCitationClassRow>(sql`
		SELECT
			prompt_id,
			(bucket AT TIME ZONE ${timezone})::date AS date,
			domain,
			static_category,
			page_type,
			sum(citations)::int AS count
		FROM rollup_citation_urls
		WHERE brand_id = ${brandId}
			${rollupWindow(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
		GROUP BY prompt_id, date, domain, static_category, page_type
		ORDER BY prompt_id, date
	`);
	return rows;
}
