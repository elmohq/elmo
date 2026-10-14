/**
 * The analytics aggregates computed straight from `prompt_runs` and `citations`,
 * as a reference the rollup reads are checked against (the parity integration
 * tests and `scripts/compare-analytics-reads.ts`). Not used in production.
 */

import { parseModelFilter } from "@workspace/config/model-filter";
import { isFanoutQuery, normalizedWebQuery } from "@workspace/lib/rollups/fanout";
import { type SQL, sql } from "drizzle-orm";
import {
	type AnalyticsScope,
	API_PROVIDER_IDS,
	apiProviderList,
	type DailyScope,
	isoInstant,
	localDate,
	queryPg,
	scopeFilter,
	uuidList,
} from "@/lib/analytics-sql";
import type { FanoutBreakdownRow, FanoutModelTotalRow, FanoutPromptTotalRow } from "@/lib/fanout-analysis";
import type {
	CitationCountByModelRow,
	CitationUrlStats,
	CompetitorTotal,
	MentionTotals,
	ModelRunSums,
	PerPromptCitationPageRow,
	PerPromptDailyCitationDomainRow,
	PerPromptDailyCompetitorRow,
	PerPromptDailyRuns,
	PerPromptRunStats,
	PromptFirstEvaluatedAt,
	VisibilityDailyAggregate,
} from "@/lib/rollup-read";

const runScope = (scope: AnalyticsScope, alias?: string) => scopeFilter(scope, { time: "created_at", alias });

// Citations don't record how their run reached the model, so the model and web
// search filters go through the run that produced them.
function citationScope(scope: AnalyticsScope): SQL {
	const viaRun = (filter: SQL) => sql`EXISTS (
		SELECT 1 FROM prompt_runs AS mf_run WHERE mf_run.id = prompt_run_id AND ${filter}
	)`;
	const target = scope.model ? parseModelFilter(scope.model) : null;
	let model = sql``;
	if (target && API_PROVIDER_IDS.length === 0) {
		model = target.premium ? sql`AND FALSE` : sql`AND model = ${target.model}`;
	} else if (target) {
		const grounded = viaRun(sql`mf_run.web_search_enabled AND mf_run.provider IN (${apiProviderList()})`);
		model = sql`AND model = ${target.model} AND ${target.premium ? grounded : sql`NOT ${grounded}`}`;
	}
	const webSearch =
		scope.webSearchEnabled === undefined
			? sql``
			: sql`AND ${viaRun(sql`mf_run.web_search_enabled = ${scope.webSearchEnabled}`)}`;
	return sql`${runScope({ ...scope, model: undefined, webSearchEnabled: undefined })} ${model} ${webSearch}`;
}

const runCounts = sql`
	count(*)::int AS runs,
	count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_runs,
	count(*) FILTER (WHERE cardinality(competitors_mentioned) > 0)::int AS competitor_runs,
	coalesce(sum(cardinality(competitors_mentioned)), 0)::int AS competitor_mentions`;

export async function getMentionTotals(scope: AnalyticsScope): Promise<MentionTotals> {
	const [row] = await queryPg<MentionTotals>(sql`
		SELECT
			${runCounts},
			count(*) FILTER (WHERE NOT brand_mentioned AND coalesce(cardinality(competitors_mentioned), 0) = 0)::int
				AS no_mention_runs,
			count(DISTINCT prompt_id)::int AS prompts,
			count(DISTINCT prompt_id) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_prompts,
			${isoInstant(sql`max(created_at)`)} AS last_run_at
		FROM prompt_runs JOIN run_mentions ON run_mentions.run_id = prompt_runs.id
		WHERE ${runScope(scope)}
	`);
	return row;
}

export async function getPerPromptDailyRuns(scope: AnalyticsScope): Promise<PerPromptDailyRuns[]> {
	// Grouped by the SELECT alias: drizzle binds the timezone afresh at every
	// interpolation, so Postgres wouldn't see a repeated expression as the same one.
	return queryPg<PerPromptDailyRuns>(sql`
		SELECT prompt_id, ${localDate(sql`created_at`, scope.timezone)} AS date, ${runCounts}
		FROM prompt_runs JOIN run_mentions ON run_mentions.run_id = prompt_runs.id
		WHERE ${runScope(scope)}
		GROUP BY prompt_id, date
		ORDER BY prompt_id, date
	`);
}

export async function getPerPromptDailyCompetitors(scope: AnalyticsScope): Promise<PerPromptDailyCompetitorRow[]> {
	return queryPg<PerPromptDailyCompetitorRow>(sql`
		SELECT
			prompt_id,
			${localDate(sql`created_at`, scope.timezone)} AS date,
			competitor,
			count(*)::int AS runs
		FROM prompt_runs JOIN run_mentions ON run_mentions.run_id = prompt_runs.id, unnest(competitors_mentioned) AS competitor
		WHERE ${runScope(scope)}
		GROUP BY prompt_id, date, competitor
		ORDER BY prompt_id, date, competitor
	`);
}

export async function getCompetitorTotals(scope: AnalyticsScope, limit?: number): Promise<CompetitorTotal[]> {
	return queryPg<CompetitorTotal>(sql`
		SELECT competitor, count(DISTINCT pr.id)::int AS runs
		FROM prompt_runs pr JOIN run_mentions rm ON rm.run_id = pr.id, unnest(rm.competitors_mentioned) AS competitor
		WHERE ${runScope(scope, "pr")}
		GROUP BY competitor
		ORDER BY runs DESC
		LIMIT ${limit ?? null}
	`);
}

export async function getPerPromptRunStats(scope: AnalyticsScope): Promise<PerPromptRunStats[]> {
	return queryPg<PerPromptRunStats>(sql`
		SELECT
			prompt_id,
			${runCounts},
			count(DISTINCT ${localDate(sql`created_at`, scope.timezone)})::int AS run_days,
			${isoInstant(sql`max(created_at)`)} AS last_run_at,
			max(${localDate(sql`created_at`, scope.timezone)}) AS last_run_date
		FROM prompt_runs JOIN run_mentions ON run_mentions.run_id = prompt_runs.id
		WHERE ${runScope(scope)}
		GROUP BY prompt_id
	`);
}

export async function getRunsByModel(scope: AnalyticsScope): Promise<ModelRunSums[]> {
	return queryPg<ModelRunSums>(sql`
		SELECT model, ${runCounts}
		FROM prompt_runs JOIN run_mentions ON run_mentions.run_id = prompt_runs.id
		WHERE ${runScope(scope)}
		GROUP BY model
		ORDER BY runs DESC
	`);
}

/**
 * Builds a (prompt × date) grid in-database, left-joins daily observations,
 * and groups rows by the running count of non-null observations to carry the
 * last observation forward. Dates before a prompt's first observation are
 * back-seeded with its earliest value.
 */
export async function getVisibilityDailyAggregate(
	scope: DailyScope,
	brandedPromptIds: string[],
): Promise<VisibilityDailyAggregate[]> {
	if (scope.promptIds.length === 0) return [];

	// A LEFT JOIN against one row per branded id, rather than `pid = ANY(...)`,
	// behaves the same whether the branded set is empty, partial, or all.
	const brandedIdsRelation = brandedPromptIds.length
		? sql`(SELECT unnest(ARRAY[${uuidList(brandedPromptIds)}]::uuid[]) AS bid)`
		: sql`(SELECT NULL::uuid AS bid WHERE FALSE)`;

	return queryPg<VisibilityDailyAggregate>(sql`
		WITH
			date_range AS (
				SELECT series::date AS day
				FROM generate_series(${scope.from}::date, ${scope.to}::date, interval '1 day') AS g(series)
			),
			prompts_list AS (
				SELECT
					p.pid AS prompt_id,
					bp.bid IS NOT NULL AS is_branded
				FROM unnest(ARRAY[${uuidList(scope.promptIds)}]::uuid[]) AS p(pid)
				LEFT JOIN ${brandedIdsRelation} bp ON bp.bid = p.pid
			),
			observations AS (
				SELECT
					prompt_id,
					${localDate(sql`created_at`, scope.timezone)} AS obs_date,
					count(*)::int AS total_runs,
					count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
				FROM prompt_runs JOIN run_mentions ON run_mentions.run_id = prompt_runs.id
				WHERE ${runScope(scope)}
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
}

export async function getBrandEarliestRunDate(brandId: string): Promise<string | null> {
	const rows = await queryPg<{ earliest_date: string | null }>(sql`
		SELECT min(created_at) AS earliest_date
		FROM prompt_runs JOIN run_mentions ON run_mentions.run_id = prompt_runs.id
		WHERE brand_id = ${brandId}
	`);
	return rows[0]?.earliest_date || null;
}

export async function getPromptsFirstEvaluatedAt(
	brandId: string,
	promptIds: string[],
): Promise<PromptFirstEvaluatedAt[]> {
	if (promptIds.length === 0) return [];
	return queryPg<PromptFirstEvaluatedAt>(sql`
		SELECT prompt_id, min(created_at) AS first_evaluated_at
		FROM prompt_runs JOIN run_mentions ON run_mentions.run_id = prompt_runs.id
		WHERE brand_id = ${brandId}
			AND prompt_id IN (${uuidList(promptIds)})
		GROUP BY prompt_id
	`);
}

export async function getCitationTotal(scope: AnalyticsScope): Promise<number> {
	const rows = await queryPg<{ total: number }>(sql`
		SELECT count(*)::int AS total
		FROM citations
		WHERE ${citationScope(scope)}
	`);
	return Number(rows[0]?.total ?? 0);
}

/** Per literal URL: the raw rows carry no page classification, so these lack the stored class columns. */
export async function getCitationUrlStats(
	scope: AnalyticsScope,
): Promise<Omit<CitationUrlStats, "static_category" | "page_type">[]> {
	return queryPg(sql`
		SELECT
			url,
			domain,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count,
			round(avg(citation_index)::numeric, 1)::float AS avg_position,
			count(DISTINCT prompt_id)::int AS prompt_count
		FROM citations
		WHERE ${citationScope(scope)}
		GROUP BY url, domain
		ORDER BY count DESC
	`);
}

export async function getCitationDomainPromptCounts(scope: AnalyticsScope): Promise<Map<string, number>> {
	const rows = await queryPg<{ domain: string; prompt_count: number }>(sql`
		SELECT domain, count(DISTINCT prompt_id)::int AS prompt_count
		FROM citations
		WHERE ${citationScope(scope)}
		GROUP BY domain
	`);
	return new Map(rows.map((row) => [row.domain, Number(row.prompt_count)]));
}

export async function getPerPromptCitationPages(scope: AnalyticsScope): Promise<PerPromptCitationPageRow[]> {
	return queryPg<PerPromptCitationPageRow>(sql`
		SELECT
			prompt_id,
			url,
			domain,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count
		FROM citations
		WHERE ${citationScope(scope)}
		GROUP BY prompt_id, url, domain
		ORDER BY prompt_id, count DESC
	`);
}

export async function getPerPromptDailyCitationDomains(
	scope: AnalyticsScope,
): Promise<PerPromptDailyCitationDomainRow[]> {
	return queryPg<PerPromptDailyCitationDomainRow>(sql`
		SELECT
			prompt_id,
			${localDate(sql`created_at`, scope.timezone)} AS date,
			domain,
			count(*)::int AS count
		FROM citations
		WHERE ${citationScope(scope)}
		GROUP BY prompt_id, date, domain
		ORDER BY prompt_id, date
	`);
}

export async function getCitationsCountByModel(scope: AnalyticsScope): Promise<CitationCountByModelRow[]> {
	return queryPg<CitationCountByModelRow>(sql`
		SELECT model, count(*)::int AS count
		FROM citations
		WHERE ${citationScope(scope)}
		GROUP BY model
	`);
}

// Fan-out straight from `web_queries`, with the rule the rebuild applies (`isFanoutQuery`).
const genuineQueries = (select: SQL) => sql`
	FROM prompt_runs pr
	JOIN prompts p ON p.id = pr.prompt_id
	JOIN run_mentions rm ON rm.run_id = pr.id
	CROSS JOIN LATERAL (
		SELECT ${select} FROM unnest(pr.web_queries) AS q WHERE ${isFanoutQuery(sql`q`, sql`p.value`)}
	) fq`;

export async function getFanoutBreakdown(scope: AnalyticsScope): Promise<FanoutBreakdownRow[]> {
	return queryPg<FanoutBreakdownRow>(sql`
		SELECT
			pr.prompt_id,
			pr.model,
			fq.query,
			count(*)::int AS count,
			count(*) FILTER (WHERE rm.brand_mentioned)::int AS brand_mentions
		${genuineQueries(sql`DISTINCT ${normalizedWebQuery(sql`q`)} AS query`)}
		WHERE ${scopeFilter(scope, { time: "created_at", alias: "pr" })}
		GROUP BY pr.prompt_id, pr.model, fq.query
	`);
}

export async function getFanoutModelTotals(scope: AnalyticsScope): Promise<FanoutModelTotalRow[]> {
	return queryPg<FanoutModelTotalRow>(sql`
		SELECT
			pr.model,
			count(*) FILTER (WHERE pr.web_search_enabled)::int AS runs,
			count(*) FILTER (WHERE fq.queries > 0)::int AS fanout_runs,
			coalesce(sum(fq.queries), 0)::int AS total_queries
		${genuineQueries(sql`count(DISTINCT ${normalizedWebQuery(sql`q`)})::int AS queries`)}
		WHERE ${scopeFilter(scope, { time: "created_at", alias: "pr" })}
		GROUP BY pr.model
		ORDER BY total_queries DESC
	`);
}

export async function getFanoutPromptTotals(scope: AnalyticsScope): Promise<FanoutPromptTotalRow[]> {
	return queryPg<FanoutPromptTotalRow>(sql`
		SELECT pr.prompt_id, count(*) FILTER (WHERE fq.queries > 0)::int AS runs
		${genuineQueries(sql`count(DISTINCT ${normalizedWebQuery(sql`q`)})::int AS queries`)}
		WHERE ${scopeFilter(scope, { time: "created_at", alias: "pr" })}
		GROUP BY pr.prompt_id
	`);
}
