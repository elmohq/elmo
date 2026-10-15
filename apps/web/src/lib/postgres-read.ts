/**
 * Reads that need individual runs: run lists, run detail and response search.
 * Aggregates, query fan-out included, come from the rollups in `rollup-read.ts`.
 */

import type { RunMentionAssessments } from "@workspace/lib/mentions";
import { type SQL, sql } from "drizzle-orm";
import {
	type AnalyticsScope,
	modelFilter,
	type PromptListScope,
	queryPg,
	scopeFilter,
	windowFilter,
} from "@/lib/analytics-sql";
import { UNAVAILABLE_SENTINEL } from "@/lib/fanout-analysis";

const dateFilter = (fromDate: string | null, toDate: string | null, timezone: string): SQL =>
	windowFilter(sql`created_at`, fromDate, toDate, timezone);

export interface WebQueryCount {
	model: string;
	web_query: string;
	query_count: number;
}

export async function getPromptWebQueryCounts(
	brandId: string,
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	model?: string,
): Promise<WebQueryCount[]> {
	// The `unavailable` sentinel (search happened, query strings unexposed) isn't
	// a usable web query — without this filter it becomes a model's "top query"
	// whenever a provider never exposes strings (OpenRouter; DataForSEO Google).
	const rows = await queryPg<WebQueryCount>(sql`
		SELECT
			model,
			web_query,
			count(*)::int AS query_count
		FROM prompt_runs, unnest(web_queries) AS web_query
		WHERE brand_id = ${brandId}
			AND prompt_id = ${promptId}
			AND array_length(web_queries, 1) > 0
			AND lower(btrim(web_query)) <> ${UNAVAILABLE_SENTINEL}
			${dateFilter(fromDate, toDate, timezone)}
			${modelFilter(model)}
		GROUP BY model, web_query
		ORDER BY model, query_count DESC
	`);
	return rows;
}

export interface PromptRunRow {
	id: string;
	prompt_id: string;
	brand_id: string;
	model: string;
	provider: string | null;
	web_search_enabled: boolean;
	brand_mentioned: boolean;
	competitors_mentioned: string[];
	assessments: RunMentionAssessments | null;
	web_queries: string[];
	citation_count: number;
	created_at: string;
}

/** Here rather than in the route so the window goes through the same
 * timezone-aware `dateFilter` as every other read. */
export async function getPromptRuns(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	limit: number,
	offset: number,
	model?: string,
): Promise<PromptRunRow[]> {
	return queryPg<PromptRunRow>(sql`
		SELECT
			prompt_runs.id::text AS id,
			prompt_runs.prompt_id::text AS prompt_id,
			prompt_runs.brand_id,
			prompt_runs.model,
			prompt_runs.provider,
			prompt_runs.web_search_enabled,
			run_mentions.brand_mentioned,
			run_mentions.competitors_mentioned,
			run_mentions.assessments,
			prompt_runs.web_queries,
			(SELECT count(*) FROM citations c WHERE c.prompt_run_id = prompt_runs.id)::int AS citation_count,
			prompt_runs.created_at
		FROM prompt_runs JOIN run_mentions ON run_mentions.run_id = prompt_runs.id
		WHERE prompt_id = ${promptId}::uuid
			${dateFilter(fromDate, toDate, timezone)}
			${modelFilter(model)}
		ORDER BY prompt_runs.created_at DESC
		LIMIT ${limit} OFFSET ${offset}
	`);
}

export async function countPromptRuns(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	model?: string,
): Promise<number> {
	const rows = await queryPg<{ total: number }>(sql`
		SELECT count(*)::int AS total
		FROM prompt_runs
		WHERE prompt_id = ${promptId}::uuid
			${dateFilter(fromDate, toDate, timezone)}
			${modelFilter(model)}
	`);
	return rows[0]?.total ?? 0;
}

// ============================================================================
// Response search
// ============================================================================

/** Runs a response search covers. Without a `query` every run in scope matches. */
export type ResponseSearchScope = PromptListScope & { query?: string };

export interface ResponseMatchRow {
	id: string;
	prompt_id: string;
	model: string;
	provider: string | null;
	version: string;
	web_queries: string[];
	brand_mentioned: boolean;
	competitors_mentioned: string[];
	assessments: RunMentionAssessments | null;
	raw_output: unknown;
	text_content: string | null;
	created_at: string;
	/** Every match in scope, not just this page — counted in the same scan. */
	matched: number;
}

/** Searches the stored answer text; `%` and `_` in the term are literal. */
function responseMatch(scope: ResponseSearchScope): SQL {
	if (!scope.query) return sql`TRUE`;
	const pattern = `%${scope.query.replace(/[\\%_]/g, "\\$&")}%`;
	return sql`re.text_content ILIKE ${pattern}`;
}

export async function getResponseMatches(
	scope: ResponseSearchScope,
	limit: number,
	offset: number,
): Promise<ResponseMatchRow[]> {
	if (scope.promptIds.length === 0) return [];
	return queryPg<ResponseMatchRow>(sql`
		SELECT
			pr.id::text AS id,
			pr.prompt_id::text AS prompt_id,
			pr.model,
			pr.provider,
			pr.version,
			pr.web_queries,
			rm.brand_mentioned,
			rm.competitors_mentioned,
			rm.assessments,
			pr.raw_output,
			re.text_content,
			pr.created_at,
			count(*) OVER ()::int AS matched
		FROM prompt_runs pr
		JOIN run_mentions rm ON rm.run_id = pr.id
		JOIN run_extractions re ON re.run_id = pr.id
		WHERE ${scopeFilter(scope, { time: "created_at", alias: "pr" })} AND ${responseMatch(scope)}
		ORDER BY pr.created_at DESC, pr.id
		LIMIT ${limit} OFFSET ${offset}
	`);
}
