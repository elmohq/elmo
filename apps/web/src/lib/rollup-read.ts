/**
 * Analytics aggregates, read from the rollup tables the worker maintains
 * (quarter-hour buckets, refreshed about a minute behind the raw rows).
 */

import { GOOGLE_STATIC_CATEGORY } from "@workspace/lib/citations/page-classification";
import type { CitationUrlRow } from "@workspace/lib/citations/rollup";
import { sql } from "drizzle-orm";
import {
	type AnalyticsScope,
	type DailyScope,
	isoInstant,
	localDate,
	queryPg,
	scopeFilter,
	uuidList,
} from "@/lib/analytics-sql";
import type { FanoutBreakdownRow, FanoutModelTotalRow, FanoutPromptTotalRow } from "@/lib/fanout-analysis";
import type { AssessmentSums } from "@/lib/sentiment";

/** The run counts every run read selects, so a new rollup column reaches them all at once. */
export interface RunSums {
	runs: number;
	brand_mentioned_runs: number;
	/** Runs that mentioned any tracked competitor. */
	competitor_runs: number;
	/** Competitor mention instances, so a run naming two competitors counts twice. */
	competitor_mentions: number;
}

export type { AssessmentSums } from "@/lib/sentiment";

export interface MentionTotals extends RunSums, AssessmentSums {
	/** Runs that mentioned neither the brand nor any competitor. */
	no_mention_runs: number;
	/** Distinct prompts with a run in scope. */
	prompts: number;
	/** Distinct prompts in which the brand was mentioned at least once. */
	brand_mentioned_prompts: number;
	last_run_at: string | null;
}

export interface PerPromptDailyRuns extends RunSums {
	prompt_id: string;
	date: string;
}

export interface PerPromptDailyCompetitorRow {
	prompt_id: string;
	date: string;
	competitor: string;
	/** Runs that day (for this prompt) that mentioned the competitor. */
	runs: number;
}

export interface CompetitorTotal extends AssessmentSums {
	competitor: string;
	runs: number;
}

export interface PerPromptRunStats extends RunSums, AssessmentSums {
	prompt_id: string;
	/** Distinct days, in the scope's timezone, on which the prompt ran. */
	run_days: number;
	last_run_at: string | null;
	/** The day of `last_run_at` in the scope's timezone. */
	last_run_date: string | null;
}

export interface ModelRunSums extends RunSums, AssessmentSums {
	model: string;
}

export interface PromptFirstEvaluatedAt {
	prompt_id: string;
	first_evaluated_at: string;
}

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

export interface CitationUrlStats extends CitationUrlRow {
	prompt_count: number;
}

export interface PerPromptCitationPageRow {
	prompt_id: string;
	url: string | null;
	domain: string;
	title: string | null;
	count: number;
}

export interface CitationPageStats extends CitationUrlStats {
	is_new: boolean;
}

export interface DroppedCitationPageRow extends Omit<CitationUrlRow, "avg_position" | "title"> {
	previous_count: number;
	current_count: number;
}

export interface PerPromptCitationDomainRow {
	prompt_id: string;
	domain: string;
	count: number;
}

export type CitationOwner = "brand" | "competitor";

export interface OwnedDomains {
	brandDomains: string[];
	competitorDomains: string[];
}

export interface PerPromptDailyCitationDomainRow {
	prompt_id: string;
	date: string;
	domain: string;
	count: number;
}

export interface PerPromptDailyCitationClassRow {
	prompt_id: string;
	date: string;
	owner: CitationOwner | null;
	static_category: string;
	page_type: string;
	count: number;
}

export interface CitationCountByModelRow {
	model: string;
	count: number;
}

const rollupScope = (scope: AnalyticsScope, alias?: string) => scopeFilter(scope, { time: "bucket", alias });

const runSums = sql`
	coalesce(sum(runs), 0)::int AS runs,
	coalesce(sum(brand_mentioned_runs), 0)::int AS brand_mentioned_runs,
	coalesce(sum(competitor_runs), 0)::int AS competitor_runs,
	coalesce(sum(competitor_mentions), 0)::int AS competitor_mentions`;

const assessmentSums = sql`
	coalesce(sum(positive_runs), 0)::int AS positive_runs,
	coalesce(sum(neutral_runs), 0)::int AS neutral_runs,
	coalesce(sum(negative_runs), 0)::int AS negative_runs,
	coalesce(sum(mixed_runs), 0)::int AS mixed_runs,
	coalesce(sum(position_sum), 0)::int AS position_sum,
	coalesce(sum(positioned_runs), 0)::int AS positioned_runs`;

export async function getMentionTotals(scope: AnalyticsScope): Promise<MentionTotals> {
	const [row] = await queryPg<MentionTotals>(sql`
		SELECT
			${runSums},
			coalesce(sum(no_mention_runs), 0)::int AS no_mention_runs,
			${assessmentSums},
			count(DISTINCT prompt_id)::int AS prompts,
			count(DISTINCT prompt_id) FILTER (WHERE brand_mentioned_runs > 0)::int AS brand_mentioned_prompts,
			${isoInstant(sql`max(last_run_at)`)} AS last_run_at
		FROM rollup_prompt_runs
		WHERE ${rollupScope(scope)}
	`);
	return row;
}

export async function getPerPromptDailyRuns(scope: AnalyticsScope): Promise<PerPromptDailyRuns[]> {
	return queryPg<PerPromptDailyRuns>(sql`
		SELECT prompt_id, ${localDate(sql`bucket`, scope.timezone)} AS date, ${runSums}
		FROM rollup_prompt_runs
		WHERE ${rollupScope(scope)}
		GROUP BY prompt_id, date
		ORDER BY prompt_id, date
	`);
}

export async function getPerPromptDailyCompetitors(scope: AnalyticsScope): Promise<PerPromptDailyCompetitorRow[]> {
	return queryPg<PerPromptDailyCompetitorRow>(sql`
		SELECT
			prompt_id,
			${localDate(sql`bucket`, scope.timezone)} AS date,
			competitor_name AS competitor,
			sum(runs)::int AS runs
		FROM rollup_competitor_mentions
		WHERE ${rollupScope(scope)}
		GROUP BY prompt_id, date, competitor
		ORDER BY prompt_id, date, competitor
	`);
}

export async function getCompetitorTotals(scope: AnalyticsScope, limit?: number): Promise<CompetitorTotal[]> {
	return queryPg<CompetitorTotal>(sql`
		SELECT competitor_name AS competitor, sum(runs)::int AS runs, ${assessmentSums}
		FROM rollup_competitor_mentions
		WHERE ${rollupScope(scope)}
		GROUP BY competitor
		ORDER BY runs DESC
		LIMIT ${limit ?? null}
	`);
}

export async function getPerPromptRunStats(scope: AnalyticsScope): Promise<PerPromptRunStats[]> {
	return queryPg<PerPromptRunStats>(sql`
		SELECT
			prompt_id,
			${runSums},
			${assessmentSums},
			count(DISTINCT ${localDate(sql`bucket`, scope.timezone)})::int AS run_days,
			${isoInstant(sql`max(last_run_at)`)} AS last_run_at,
			${localDate(sql`max(last_run_at)`, scope.timezone)} AS last_run_date
		FROM rollup_prompt_runs
		WHERE ${rollupScope(scope)}
		GROUP BY prompt_id
	`);
}

export async function getRunsByModel(scope: AnalyticsScope): Promise<ModelRunSums[]> {
	return queryPg<ModelRunSums>(sql`
		SELECT model, ${runSums}, ${assessmentSums}
		FROM rollup_prompt_runs
		WHERE ${rollupScope(scope)}
		GROUP BY model
		ORDER BY runs DESC
	`);
}

export async function getVisibilityDailyAggregate(
	scope: DailyScope,
	brandedPromptIds: string[],
): Promise<VisibilityDailyAggregate[]> {
	if (scope.promptIds.length === 0) return [];

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
					${localDate(sql`bucket`, scope.timezone)} AS obs_date,
					sum(runs)::int AS total_runs,
					sum(brand_mentioned_runs)::int AS brand_mentioned_count
				FROM rollup_prompt_runs
				WHERE ${rollupScope(scope)}
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
		SELECT min(first_run_at) AS earliest_date
		FROM rollup_prompt_runs
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
		SELECT prompt_id, min(first_run_at) AS first_evaluated_at
		FROM rollup_prompt_runs
		WHERE brand_id = ${brandId}
			AND prompt_id IN (${uuidList(promptIds)})
		GROUP BY prompt_id
	`);
}

export async function getCitationTotal(scope: AnalyticsScope): Promise<number> {
	const rows = await queryPg<{ total: number }>(sql`
		SELECT coalesce(sum(citations), 0)::int AS total
		FROM rollup_citation_urls
		WHERE ${rollupScope(scope)}
	`);
	return Number(rows[0]?.total ?? 0);
}

export async function getCitationUrlStats(scope: AnalyticsScope): Promise<CitationUrlStats[]> {
	return queryPg<CitationUrlStats>(sql`
		SELECT
			cp.url AS url,
			cp.domain AS domain,
			cp.title AS title,
			cp.static_category,
			cp.page_type,
			sum(rcu.citations)::int AS count,
			round(sum(rcu.position_sum)::numeric / NULLIF(sum(rcu.citations), 0), 1)::float AS avg_position,
			count(DISTINCT rcu.prompt_id)::int AS prompt_count
		FROM rollup_citation_urls rcu
		JOIN cited_pages cp ON cp.id = rcu.page_id
		WHERE ${rollupScope(scope, "rcu")}
		GROUP BY rcu.page_id, cp.url, cp.domain, cp.title, cp.static_category, cp.page_type
		ORDER BY count DESC
	`);
}

export async function getCitationDomainPromptCounts(scope: AnalyticsScope): Promise<Map<string, number>> {
	const rows = await queryPg<{ domain: string; prompt_count: number }>(sql`
		SELECT domain, count(DISTINCT prompt_id)::int AS prompt_count
		FROM rollup_citation_urls
		WHERE ${rollupScope(scope)}
		GROUP BY domain
	`);
	return new Map(rows.map((row) => [row.domain, Number(row.prompt_count)]));
}

export async function getPerPromptCitationPages(scope: AnalyticsScope): Promise<PerPromptCitationPageRow[]> {
	return queryPg<PerPromptCitationPageRow>(sql`
		SELECT
			rcu.prompt_id AS prompt_id,
			cp.url AS url,
			cp.domain AS domain,
			cp.title AS title,
			sum(rcu.citations)::int AS count
		FROM rollup_citation_urls rcu
		JOIN cited_pages cp ON cp.id = rcu.page_id
		WHERE ${rollupScope(scope, "rcu")}
		GROUP BY rcu.prompt_id, rcu.page_id, cp.url, cp.domain, cp.title
		ORDER BY rcu.prompt_id, count DESC
	`);
}

export async function getPerPromptGooglePages(scope: AnalyticsScope): Promise<PerPromptCitationPageRow[]> {
	return queryPg<PerPromptCitationPageRow>(sql`
		SELECT p.prompt_id, cp.url, cp.domain, cp.title, p.count
		FROM (
			SELECT prompt_id, page_id, sum(citations)::int AS count
			FROM rollup_citation_urls
			WHERE ${rollupScope(scope)} AND domain ~ '(^|\.)google\.[a-z.]+$'
			GROUP BY prompt_id, page_id
		) p
		JOIN cited_pages cp ON cp.id = p.page_id
		WHERE cp.static_category = ${GOOGLE_STATIC_CATEGORY}
		ORDER BY p.prompt_id, p.count DESC, cp.url
	`);
}

export async function getPerPromptCitationDomains(scope: AnalyticsScope): Promise<PerPromptCitationDomainRow[]> {
	return queryPg<PerPromptCitationDomainRow>(sql`
		SELECT prompt_id, domain, sum(citations)::int AS count
		FROM rollup_citation_urls
		WHERE ${rollupScope(scope)}
		GROUP BY prompt_id, domain
		ORDER BY prompt_id
	`);
}

export async function getCitationPageStats(
	scope: AnalyticsScope,
	previous: AnalyticsScope,
): Promise<CitationPageStats[]> {
	return queryPg<CitationPageStats>(sql`
		WITH
			pages AS (
				SELECT
					page_id,
					sum(citations)::int AS count,
					round(sum(position_sum)::numeric / NULLIF(sum(citations), 0), 1)::float AS avg_position,
					count(DISTINCT prompt_id)::int AS prompt_count
				FROM rollup_citation_urls
				WHERE ${rollupScope(scope)}
				GROUP BY page_id
			),
			earlier AS (SELECT DISTINCT page_id FROM rollup_citation_urls WHERE ${rollupScope(previous)})
		SELECT
			cp.url,
			cp.domain,
			cp.title,
			cp.static_category,
			cp.page_type,
			p.count,
			p.avg_position,
			p.prompt_count,
			e.page_id IS NULL AS is_new
		FROM pages p
		JOIN cited_pages cp ON cp.id = p.page_id
		LEFT JOIN earlier e ON e.page_id = p.page_id
		WHERE cp.static_category <> ${GOOGLE_STATIC_CATEGORY}
		ORDER BY p.count DESC, cp.url
	`);
}

export async function getCitationDomainCounts(scope: AnalyticsScope): Promise<{ domain: string; count: number }[]> {
	return queryPg<{ domain: string; count: number }>(sql`
		SELECT cp.domain, sum(p.count)::int AS count
		FROM (
			SELECT page_id, sum(citations) AS count
			FROM rollup_citation_urls
			WHERE ${rollupScope(scope)}
			GROUP BY page_id
		) p
		JOIN cited_pages cp ON cp.id = p.page_id
		WHERE cp.static_category <> ${GOOGLE_STATIC_CATEGORY}
		GROUP BY cp.domain
		ORDER BY max(p.count) DESC
	`);
}

export async function getDroppedCitationPages(
	scope: AnalyticsScope,
	previous: AnalyticsScope,
	minCount: number,
	limit: number,
): Promise<DroppedCitationPageRow[]> {
	return queryPg<DroppedCitationPageRow>(sql`
		WITH counts AS (
			SELECT page_id, sum(earlier)::int AS previous_count, sum(later)::int AS current_count
			FROM (
				SELECT page_id, citations AS earlier, 0 AS later FROM rollup_citation_urls WHERE ${rollupScope(previous)}
				UNION ALL
				SELECT page_id, 0, citations FROM rollup_citation_urls WHERE ${rollupScope(scope)}
			) cited
			GROUP BY page_id
			HAVING sum(earlier) >= ${minCount} AND sum(later) * 2 <= sum(earlier)
		)
		SELECT cp.url, cp.domain, cp.static_category, cp.page_type, c.previous_count, c.current_count
		FROM counts c
		JOIN cited_pages cp ON cp.id = c.page_id
		WHERE cp.static_category <> ${GOOGLE_STATIC_CATEGORY}
		ORDER BY c.previous_count DESC, cp.url
		LIMIT ${limit}
	`);
}

export async function getPerPromptDailyCitationDomains(
	scope: AnalyticsScope,
): Promise<PerPromptDailyCitationDomainRow[]> {
	return queryPg<PerPromptDailyCitationDomainRow>(sql`
		SELECT
			prompt_id,
			${localDate(sql`bucket`, scope.timezone)} AS date,
			domain,
			sum(citations)::int AS count
		FROM rollup_citation_urls
		WHERE ${rollupScope(scope)}
		GROUP BY prompt_id, date, domain
		ORDER BY prompt_id, date
	`);
}

const textList = (values: string[]) =>
	values.length === 0
		? sql`ARRAY[]::text[]`
		: sql`ARRAY[${sql.join(
				values.map((value) => sql`${value}`),
				sql`, `,
			)}]::text[]`;

export async function getPerPromptDailyCitationClasses(
	scope: AnalyticsScope,
	owned: OwnedDomains,
): Promise<PerPromptDailyCitationClassRow[]> {
	return queryPg<PerPromptDailyCitationClassRow>(sql`
		WITH
			owned AS (
				SELECT suffix, 'brand' AS owner, 1 AS precedence FROM unnest(${textList(owned.brandDomains)}) AS b(suffix)
				UNION ALL
				SELECT suffix, 'competitor', 2 FROM unnest(${textList(owned.competitorDomains)}) AS c(suffix)
			),
			cited AS (
				SELECT
					rcu.prompt_id,
					${localDate(sql`rcu.bucket`, scope.timezone)} AS date,
					rcu.domain,
					cp.static_category,
					cp.page_type,
					sum(rcu.citations)::int AS count
				FROM rollup_citation_urls rcu
				JOIN cited_pages cp ON cp.id = rcu.page_id
				WHERE ${rollupScope(scope, "rcu")} AND cp.static_category <> ${GOOGLE_STATIC_CATEGORY}
				GROUP BY 1, 2, 3, 4, 5
			),
			owners AS (
				SELECT DISTINCT ON (d.domain) d.domain, o.owner
				FROM (SELECT DISTINCT domain FROM cited) d
				JOIN owned o ON d.domain = o.suffix OR right(d.domain, length(o.suffix) + 1) = '.' || o.suffix
				ORDER BY d.domain, o.precedence
			)
		SELECT c.prompt_id, c.date, o.owner, c.static_category, c.page_type, sum(c.count)::int AS count
		FROM cited c
		LEFT JOIN owners o ON o.domain = c.domain
		GROUP BY 1, 2, 3, 4, 5
		ORDER BY c.prompt_id, c.date
	`);
}

export async function getCitationsCountByModel(scope: AnalyticsScope): Promise<CitationCountByModelRow[]> {
	return queryPg<CitationCountByModelRow>(sql`
		SELECT model, sum(citations)::int AS count
		FROM rollup_citation_urls
		WHERE ${rollupScope(scope)}
		GROUP BY model
	`);
}

/** Each genuine fan-out query per prompt and model, counted once per run that searched it. */
export async function getFanoutBreakdown(scope: AnalyticsScope): Promise<FanoutBreakdownRow[]> {
	return queryPg<FanoutBreakdownRow>(sql`
		SELECT
			prompt_id,
			model,
			query,
			sum(runs)::int AS count,
			sum(brand_mentioned_runs)::int AS brand_mentions
		FROM rollup_web_queries
		WHERE ${rollupScope(scope)}
		GROUP BY prompt_id, model, query
	`);
}

/** Per model: web-search runs, runs that fanned out, and their distinct queries summed (the per-run denominators). */
export async function getFanoutModelTotals(scope: AnalyticsScope): Promise<FanoutModelTotalRow[]> {
	return queryPg<FanoutModelTotalRow>(sql`
		SELECT
			model,
			coalesce(sum(runs) FILTER (WHERE web_search_enabled), 0)::int AS runs,
			coalesce(sum(fanout_runs), 0)::int AS fanout_runs,
			coalesce(sum(fanout_queries), 0)::int AS total_queries
		FROM rollup_prompt_runs
		WHERE ${rollupScope(scope)}
		GROUP BY model
		ORDER BY total_queries DESC
	`);
}

export async function getFanoutPromptTotals(scope: AnalyticsScope): Promise<FanoutPromptTotalRow[]> {
	return queryPg<FanoutPromptTotalRow>(sql`
		SELECT prompt_id, coalesce(sum(fanout_runs), 0)::int AS runs
		FROM rollup_prompt_runs
		WHERE ${rollupScope(scope)}
		GROUP BY prompt_id
	`);
}

export interface DailyAssessments extends AssessmentSums {
	date: string;
}

export async function getDailyAssessments(scope: AnalyticsScope): Promise<DailyAssessments[]> {
	return queryPg<DailyAssessments>(sql`
		SELECT
			to_char(${localDate(sql`bucket`, scope.timezone)}, 'YYYY-MM-DD') AS date,
			${assessmentSums}
		FROM rollup_prompt_runs
		WHERE ${rollupScope(scope)}
		GROUP BY 1
		ORDER BY 1
	`);
}

export interface PromptModelDailyRuns extends RunSums, AssessmentSums {
	prompt_id: string;
	model: string;
	date: string;
}

export async function getPromptModelDailyRuns(scope: AnalyticsScope): Promise<PromptModelDailyRuns[]> {
	return queryPg<PromptModelDailyRuns>(sql`
		SELECT
			prompt_id,
			model,
			to_char(${localDate(sql`bucket`, scope.timezone)}, 'YYYY-MM-DD') AS date,
			${runSums},
			${assessmentSums}
		FROM rollup_prompt_runs
		WHERE ${rollupScope(scope)}
		GROUP BY 1, 2, 3
	`);
}

export interface PromptModelDailyCompetitor extends AssessmentSums {
	prompt_id: string;
	model: string;
	date: string;
	competitor: string;
	/** Runs that mentioned the competitor. */
	runs: number;
}

export async function getPromptModelDailyCompetitors(scope: AnalyticsScope): Promise<PromptModelDailyCompetitor[]> {
	return queryPg<PromptModelDailyCompetitor>(sql`
		SELECT
			prompt_id,
			model,
			to_char(${localDate(sql`bucket`, scope.timezone)}, 'YYYY-MM-DD') AS date,
			competitor_name AS competitor,
			sum(runs)::int AS runs,
			${assessmentSums}
		FROM rollup_competitor_mentions
		WHERE ${rollupScope(scope)}
		GROUP BY 1, 2, 3, 4
	`);
}
