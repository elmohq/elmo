/**
 * Analytics aggregates, read from the rollup tables the worker maintains
 * (quarter-hour buckets, refreshed about a minute behind the raw rows).
 */

import { GOOGLE_STATIC_CATEGORY } from "@workspace/lib/citations/page-classification";
import type { CitationUrlRow } from "@workspace/lib/citations/rollup";
import { type SQL, sql } from "drizzle-orm";
import {
	type AnalyticsScope,
	type DailyScope,
	isoInstant,
	localDate,
	type PromptListScope,
	type SqlQuery,
	scopeFilter,
	uuidList,
} from "@/lib/analytics-sql";
import { type CitationOwner, containing, type OwnedDomains, ownersCte, pageOf } from "@/lib/citation-read";
import type { FanoutBreakdownRow, FanoutModelTotalRow, FanoutPromptTotalRow } from "@/lib/fanout-analysis";
import type { AssessmentSums, Sentiment } from "@/lib/sentiment";
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

export interface PerPromptCitationDomainRow {
	prompt_id: string;
	domain: string;
	count: number;
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

export interface FanoutQueryRow {
	query: string;
	runs: number;
	prompt_count: number;
}

const fanoutQueries = (scope: AnalyticsScope) => sql`
	queries AS (
		SELECT query, prompt_id, runs, brand_mentioned_runs
		FROM rollup_web_queries
		WHERE ${rollupScope(scope)}
	)`;

export interface DailyAssessments extends AssessmentSums {
	date: string;
}

export interface PromptModelDailyRuns extends RunSums, AssessmentSums {
	prompt_id: string;
	model: string;
	date: string;
}

export interface PromptModelDailyCompetitor extends AssessmentSums {
	prompt_id: string;
	model: string;
	date: string;
	competitor: string;
	/** Runs that mentioned the competitor. */
	runs: number;
}

export interface SentimentQuotePick {
	id: string;
	prompt_id: string;
	model: string;
	created_at: string;
	sentiment: Sentiment;
	place: number;
}

/** The surest answer per sentiment and prompt, then the surest `limit` of those per sentiment. */
export function sentimentQuotePicks(scope: PromptListScope, sentiments: readonly Sentiment[], limit: number): SQL {
	return sql`
		WITH
			best AS (
				SELECT DISTINCT ON (sentiment, prompt_id) run_id, prompt_id, model, created_at, sentiment, confidence
				FROM rollup_sentiment_quotes
				WHERE ${rollupScope(scope)}
					AND sentiment IN (${sql.join(
						sentiments.map((sentiment) => sql`${sentiment}`),
						sql`, `,
					)})
				ORDER BY sentiment, prompt_id, confidence DESC, created_at DESC, run_id
			),
			ranked AS (
				SELECT *, row_number() OVER (PARTITION BY sentiment ORDER BY confidence DESC, created_at DESC, run_id) AS place
				FROM best
			)
		SELECT run_id::text AS id, prompt_id::text AS prompt_id, model, created_at, sentiment, place::int AS place
		FROM ranked
		WHERE place <= ${limit}`;
}

export function rollupReads(query: SqlQuery) {
	async function getSentimentQuotePicks(
		scope: PromptListScope,
		sentiments: readonly Sentiment[],
		limit: number,
	): Promise<SentimentQuotePick[]> {
		if (scope.promptIds.length === 0 || sentiments.length === 0) return [];
		return query<SentimentQuotePick>(sql`${sentimentQuotePicks(scope, sentiments, limit)} ORDER BY sentiment, place`);
	}

	async function getMentionTotals(scope: AnalyticsScope): Promise<MentionTotals> {
		const [row] = await query<MentionTotals>(sql`
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

	async function getPerPromptDailyRuns(scope: AnalyticsScope): Promise<PerPromptDailyRuns[]> {
		return query<PerPromptDailyRuns>(sql`
			SELECT prompt_id, ${localDate(sql`bucket`, scope.timezone)} AS date, ${runSums}
			FROM rollup_prompt_runs
			WHERE ${rollupScope(scope)}
			GROUP BY prompt_id, date
			ORDER BY prompt_id, date
		`);
	}

	async function getPerPromptDailyCompetitors(scope: AnalyticsScope): Promise<PerPromptDailyCompetitorRow[]> {
		return query<PerPromptDailyCompetitorRow>(sql`
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

	async function getCompetitorTotals(scope: AnalyticsScope, limit?: number): Promise<CompetitorTotal[]> {
		return query<CompetitorTotal>(sql`
			SELECT competitor_name AS competitor, sum(runs)::int AS runs, ${assessmentSums}
			FROM rollup_competitor_mentions
			WHERE ${rollupScope(scope)}
			GROUP BY competitor
			ORDER BY runs DESC
			LIMIT ${limit ?? null}
		`);
	}

	async function getPerPromptRunStats(scope: AnalyticsScope): Promise<PerPromptRunStats[]> {
		return query<PerPromptRunStats>(sql`
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

	async function getRunsByModel(scope: AnalyticsScope): Promise<ModelRunSums[]> {
		return query<ModelRunSums>(sql`
			SELECT model, ${runSums}, ${assessmentSums}
			FROM rollup_prompt_runs
			WHERE ${rollupScope(scope)}
			GROUP BY model
			ORDER BY runs DESC
		`);
	}

	async function getVisibilityDailyAggregate(
		scope: DailyScope,
		brandedPromptIds: string[],
	): Promise<VisibilityDailyAggregate[]> {
		if (scope.promptIds.length === 0) return [];

		const brandedIdsRelation = brandedPromptIds.length
			? sql`(SELECT unnest(ARRAY[${uuidList(brandedPromptIds)}]::uuid[]) AS bid)`
			: sql`(SELECT NULL::uuid AS bid WHERE FALSE)`;

		return query<VisibilityDailyAggregate>(sql`
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

	async function getBrandEarliestRunDate(brandId: string): Promise<string | null> {
		const rows = await query<{ earliest_date: string | null }>(sql`
			SELECT min(first_run_at) AS earliest_date
			FROM rollup_prompt_runs
			WHERE brand_id = ${brandId}
		`);
		return rows[0]?.earliest_date || null;
	}

	async function getPromptsFirstEvaluatedAt(brandId: string, promptIds: string[]): Promise<PromptFirstEvaluatedAt[]> {
		if (promptIds.length === 0) return [];
		return query<PromptFirstEvaluatedAt>(sql`
			SELECT prompt_id, min(first_run_at) AS first_evaluated_at
			FROM rollup_prompt_runs
			WHERE brand_id = ${brandId}
				AND prompt_id IN (${uuidList(promptIds)})
			GROUP BY prompt_id
		`);
	}

	async function getCitationTotal(scope: AnalyticsScope): Promise<number> {
		const rows = await query<{ total: number }>(sql`
			SELECT coalesce(sum(citations), 0)::int AS total
			FROM rollup_citation_urls
			WHERE ${rollupScope(scope)}
		`);
		return Number(rows[0]?.total ?? 0);
	}

	async function getCitationUrlStats(scope: AnalyticsScope): Promise<CitationUrlStats[]> {
		return query<CitationUrlStats>(sql`
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
			JOIN rollup_citation_pages cp ON cp.brand_id = rcu.brand_id AND cp.page_id = rcu.page_id
			WHERE ${rollupScope(scope, "rcu")}
			GROUP BY rcu.page_id, cp.url, cp.domain, cp.title, cp.static_category, cp.page_type
			ORDER BY count DESC
		`);
	}

	async function getPerPromptCitationPages(scope: AnalyticsScope): Promise<PerPromptCitationPageRow[]> {
		return query<PerPromptCitationPageRow>(sql`
			SELECT
				rcu.prompt_id AS prompt_id,
				cp.url AS url,
				cp.domain AS domain,
				cp.title AS title,
				sum(rcu.citations)::int AS count
			FROM rollup_citation_urls rcu
			JOIN rollup_citation_pages cp ON cp.brand_id = rcu.brand_id AND cp.page_id = rcu.page_id
			WHERE ${rollupScope(scope, "rcu")}
			GROUP BY rcu.prompt_id, rcu.page_id, cp.url, cp.domain, cp.title
			ORDER BY rcu.prompt_id, count DESC
		`);
	}

	/** In no particular order: a long range returns a row per search, and callers fold them onto products and queries. */
	async function getPerPromptGooglePages(scope: AnalyticsScope): Promise<PerPromptCitationPageRow[]> {
		return query<PerPromptCitationPageRow>(sql`
			SELECT p.prompt_id, cp.url, cp.domain, cp.title, p.count
			FROM (
				SELECT prompt_id, page_id, sum(citations)::int AS count
				FROM rollup_citation_urls
				WHERE ${rollupScope(scope)} AND domain ~ '(^|\.)google\.[a-z.]+$'
				GROUP BY prompt_id, page_id
			) p
			JOIN rollup_citation_pages cp ON cp.brand_id = ${scope.brandId} AND cp.page_id = p.page_id
			WHERE cp.static_category = ${GOOGLE_STATIC_CATEGORY}
		`);
	}

	async function getPerPromptCitationDomains(scope: AnalyticsScope): Promise<PerPromptCitationDomainRow[]> {
		return query<PerPromptCitationDomainRow>(sql`
			SELECT prompt_id, domain, sum(citations)::int AS count
			FROM rollup_citation_urls
			WHERE ${rollupScope(scope)}
			GROUP BY prompt_id, domain
			ORDER BY prompt_id
		`);
	}

	async function getPerPromptDailyCitationDomains(scope: AnalyticsScope): Promise<PerPromptDailyCitationDomainRow[]> {
		return query<PerPromptDailyCitationDomainRow>(sql`
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

	async function getPerPromptDailyCitationClasses(
		scope: AnalyticsScope,
		owned: OwnedDomains,
	): Promise<PerPromptDailyCitationClassRow[]> {
		return query<PerPromptDailyCitationClassRow>(sql`
			WITH
				cited AS (
					SELECT
						rcu.prompt_id,
						${localDate(sql`rcu.bucket`, scope.timezone)} AS date,
						cp.domain,
						cp.static_category,
						cp.page_type,
						sum(rcu.citations)::int AS count
					FROM rollup_citation_urls rcu
					JOIN rollup_citation_pages cp ON cp.brand_id = rcu.brand_id AND cp.page_id = rcu.page_id
					WHERE ${rollupScope(scope, "rcu")} AND cp.static_category <> ${GOOGLE_STATIC_CATEGORY}
					GROUP BY 1, 2, 3, 4, 5
				),
				${ownersCte(owned, sql`SELECT DISTINCT domain FROM cited`)}
			SELECT c.prompt_id, c.date, o.owner, c.static_category, c.page_type, sum(c.count)::int AS count
			FROM cited c
			LEFT JOIN owners o ON o.domain = c.domain
			GROUP BY 1, 2, 3, 4, 5
			ORDER BY c.prompt_id, c.date
		`);
	}

	async function getCitationsCountByModel(scope: AnalyticsScope): Promise<CitationCountByModelRow[]> {
		return query<CitationCountByModelRow>(sql`
			SELECT model, sum(citations)::int AS count
			FROM rollup_citation_urls
			WHERE ${rollupScope(scope)}
			GROUP BY model
		`);
	}

	/** Each genuine fan-out query per prompt and model, counted once per run that searched it. */
	async function getFanoutBreakdown(scope: AnalyticsScope): Promise<FanoutBreakdownRow[]> {
		return query<FanoutBreakdownRow>(sql`
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
	async function getFanoutModelTotals(scope: AnalyticsScope): Promise<FanoutModelTotalRow[]> {
		return query<FanoutModelTotalRow>(sql`
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

	async function getFanoutQueryPage(
		scope: AnalyticsScope,
		search: string | undefined,
		limit: number,
		offset: number,
	): Promise<{ rows: FanoutQueryRow[]; total: number }> {
		const term = search?.trim();
		return pageOf<FanoutQueryRow>(
			query,
			fanoutQueries(scope),
			sql`
				SELECT query, sum(runs)::int AS runs, count(DISTINCT prompt_id)::int AS prompt_count
				FROM queries
				${term ? sql`WHERE query ILIKE ${containing(term)}` : sql``}
				GROUP BY query`,
			sql`runs DESC, prompt_count DESC, query COLLATE "C"`,
			limit,
			offset,
		);
	}

	async function getFanoutQueryTotals(
		scope: AnalyticsScope,
	): Promise<{ total_queries: number; unique_queries: number; brand_mentions: number }> {
		const [row] = await query<{ total_queries: number; unique_queries: number; brand_mentions: number }>(sql`
			WITH ${fanoutQueries(scope)}
			SELECT
				coalesce(sum(runs), 0)::int AS total_queries,
				count(DISTINCT query)::int AS unique_queries,
				coalesce(sum(brand_mentioned_runs), 0)::int AS brand_mentions
			FROM queries
		`);
		return {
			total_queries: Number(row?.total_queries ?? 0),
			unique_queries: Number(row?.unique_queries ?? 0),
			brand_mentions: Number(row?.brand_mentions ?? 0),
		};
	}

	async function getFanoutPromptTotals(scope: AnalyticsScope): Promise<FanoutPromptTotalRow[]> {
		return query<FanoutPromptTotalRow>(sql`
			SELECT prompt_id, coalesce(sum(fanout_runs), 0)::int AS runs
			FROM rollup_prompt_runs
			WHERE ${rollupScope(scope)}
			GROUP BY prompt_id
		`);
	}

	async function getDailyAssessments(scope: AnalyticsScope): Promise<DailyAssessments[]> {
		return query<DailyAssessments>(sql`
			SELECT
				to_char(${localDate(sql`bucket`, scope.timezone)}, 'YYYY-MM-DD') AS date,
				${assessmentSums}
			FROM rollup_prompt_runs
			WHERE ${rollupScope(scope)}
			GROUP BY 1
			ORDER BY 1
		`);
	}

	async function getPromptModelDailyRuns(scope: AnalyticsScope): Promise<PromptModelDailyRuns[]> {
		return query<PromptModelDailyRuns>(sql`
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

	async function getPromptModelDailyCompetitors(scope: AnalyticsScope): Promise<PromptModelDailyCompetitor[]> {
		return query<PromptModelDailyCompetitor>(sql`
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

	return {
		getSentimentQuotePicks,
		getMentionTotals,
		getPerPromptDailyRuns,
		getPerPromptDailyCompetitors,
		getCompetitorTotals,
		getPerPromptRunStats,
		getRunsByModel,
		getVisibilityDailyAggregate,
		getBrandEarliestRunDate,
		getPromptsFirstEvaluatedAt,
		getCitationTotal,
		getCitationUrlStats,
		getPerPromptCitationPages,
		getPerPromptGooglePages,
		getPerPromptCitationDomains,
		getPerPromptDailyCitationDomains,
		getPerPromptDailyCitationClasses,
		getCitationsCountByModel,
		getFanoutBreakdown,
		getFanoutModelTotals,
		getFanoutQueryPage,
		getFanoutQueryTotals,
		getFanoutPromptTotals,
		getDailyAssessments,
		getPromptModelDailyRuns,
		getPromptModelDailyCompetitors,
	};
}
