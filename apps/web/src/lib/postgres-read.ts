/**
 * Reads that need individual runs: run lists, response search, and query fan-out.
 * Aggregates come from the rollups in `rollup-read.ts`.
 */

import { type SQL, sql } from "drizzle-orm";
import { modelFilter, queryPg, uuidList, windowEnd, windowFilter, windowStart } from "@/lib/analytics-sql";
import {
	type FanoutBreakdownRow,
	type FanoutModelTotalRow,
	type FanoutPromptTotalRow,
	UNAVAILABLE_SENTINEL,
} from "@/lib/fanout-analysis";

const dateFilter = (fromDate: string | null, toDate: string | null, timezone: string): SQL =>
	windowFilter(sql`created_at`, fromDate, toDate, timezone);

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
	// The `unavailable` sentinel (search happened, query strings unexposed) isn't
	// a usable web query — without this filter it becomes a model's "top query"
	// whenever a provider never exposes strings (OpenRouter; DataForSEO Google).
	const rows = await queryPg<WebQueryCount>(sql`
		SELECT
			model,
			web_query,
			count(*)::int AS query_count
		FROM prompt_runs, unnest(web_queries) AS web_query
		WHERE prompt_id = ${promptId}
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
			prompt_runs.brand_mentioned,
			prompt_runs.competitors_mentioned,
			prompt_runs.web_queries,
			(SELECT count(*) FROM citations c WHERE c.prompt_run_id = prompt_runs.id)::int AS citation_count,
			prompt_runs.created_at
		FROM prompt_runs
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

/**
 * Predicate selecting genuine fan-out queries: non-empty, not the `unavailable`
 * sentinel (OpenRouter and DataForSEO always; BrightData/Olostep on extraction
 * failure), and not the prompt repeated verbatim. Shared by the breakdown, model
 * totals, and per-prompt totals so all three count the same set. Requires a
 * `wq` unnest alias plus the `pr` prompt_runs and `p` prompts rows in scope.
 *
 * The verbatim-repeat exclusion is a display rule, not data cleaning: engines
 * genuinely search the prompt verbatim sometimes, and those entries stay in
 * `web_queries` — but a repeat says nothing about how the prompt was rewritten,
 * so it isn't fan-out. The comparison uses the prompt's CURRENT text, so after
 * a prompt edit, searches of the old wording start surfacing as queries: for
 * honest providers those are real searches; only pre-2026-06 DataForSEO rows
 * (which fabricated `[prompt]` as their query field; the provider now writes
 * the sentinel) would surface something that never ran, and those age out of
 * the lookback windows.
 */
function genuineFanoutWq(): SQL {
	return sql`length(btrim(wq)) > 0 AND lower(btrim(wq)) <> ${UNAVAILABLE_SENTINEL} AND lower(btrim(wq)) <> lower(btrim(p.value))`;
}

/**
 * (prompt × model × query) fan-out counts with how often the brand was mentioned.
 * The LATERAL emits each run's DISTINCT normalized queries, so a run that lists
 * the same query twice contributes one instance (`count` = runs that searched it,
 * keeping `brand_mentions <= count` and the count >= 2 Invisible/Won gate
 * meaning "ran in 2+ runs"). Normalizing here (lowercase + trim) merges case
 * variants exactly like the aggregator's `norm`.
 */
export async function getFanoutBreakdown(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<FanoutBreakdownRow[]> {
	if (!enabledPromptIds?.length) return [];
	return queryPg<FanoutBreakdownRow>(sql`
		SELECT
			pr.prompt_id,
			pr.model,
			fq.query,
			count(*)::int AS count,
			count(*) FILTER (WHERE pr.brand_mentioned)::int AS brand_mentions
		FROM prompt_runs pr
		JOIN prompts p ON p.id = pr.prompt_id
		CROSS JOIN LATERAL (
			SELECT DISTINCT lower(btrim(wq)) AS query FROM unnest(pr.web_queries) AS wq WHERE ${genuineFanoutWq()}
		) fq
		WHERE pr.brand_id = ${brandId}
			AND pr.created_at >= ${windowStart(fromDate, timezone)}
			AND pr.created_at < ${windowEnd(toDate, timezone)}
			AND pr.prompt_id IN (${uuidList(enabledPromptIds)})
			${modelFilter(model, { alias: "pr" })}
		GROUP BY pr.prompt_id, pr.model, fq.query
	`);
}

/** Per-model run counts and fan-out totals (the denominators for fan-outs-per-execution). */
export async function getFanoutModelTotals(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<FanoutModelTotalRow[]> {
	if (!enabledPromptIds?.length) return [];
	// `runs` counts every web-search-enabled run ("Search Prompt Runs"); `fanout_runs`
	// and `total_queries` count only genuine fan-out (via `genuineFanoutWq`), so they
	// stay consistent with `getFanoutBreakdown`. The per-run LATERAL yields one row per
	// run holding its DISTINCT genuine-query count (per-run duplicates count once, as
	// in the breakdown). Engines that don't expose their searches contribute runs
	// but no queries.
	return queryPg<FanoutModelTotalRow>(sql`
		SELECT
			pr.model,
			count(*) FILTER (WHERE pr.web_search_enabled)::int AS runs,
			count(*) FILTER (WHERE fq.cnt > 0)::int AS fanout_runs,
			COALESCE(sum(fq.cnt), 0)::int AS total_queries
		FROM prompt_runs pr
		JOIN prompts p ON p.id = pr.prompt_id
		CROSS JOIN LATERAL (
			SELECT count(DISTINCT lower(btrim(wq)))::int AS cnt FROM unnest(pr.web_queries) AS wq WHERE ${genuineFanoutWq()}
		) fq
		WHERE pr.brand_id = ${brandId}
			AND pr.created_at >= ${windowStart(fromDate, timezone)}
			AND pr.created_at < ${windowEnd(toDate, timezone)}
			AND pr.prompt_id IN (${uuidList(enabledPromptIds)})
			${modelFilter(model, { alias: "pr" })}
		GROUP BY pr.model
		ORDER BY total_queries DESC
	`);
}

/**
 * Per-prompt count of runs that produced ≥1 genuine fan-out query — the
 * denominator for avg fan-out per run. Uses the same `genuineFanoutWq` filter as
 * the breakdown, so echoes/sentinels don't inflate it.
 */
export async function getFanoutPromptTotals(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<FanoutPromptTotalRow[]> {
	if (!enabledPromptIds?.length) return [];
	return queryPg<FanoutPromptTotalRow>(sql`
		SELECT
			pr.prompt_id,
			count(*) FILTER (WHERE fq.cnt > 0)::int AS runs
		FROM prompt_runs pr
		JOIN prompts p ON p.id = pr.prompt_id
		CROSS JOIN LATERAL (
			SELECT count(DISTINCT lower(btrim(wq)))::int AS cnt FROM unnest(pr.web_queries) AS wq WHERE ${genuineFanoutWq()}
		) fq
		WHERE pr.brand_id = ${brandId}
			AND pr.created_at >= ${windowStart(fromDate, timezone)}
			AND pr.created_at < ${windowEnd(toDate, timezone)}
			AND pr.prompt_id IN (${uuidList(enabledPromptIds)})
			${modelFilter(model, { alias: "pr" })}
		GROUP BY pr.prompt_id
	`);
}

// ============================================================================
// Response search
// ============================================================================

/** Runs a response search covers. Without a `query` every run in scope matches. */
export interface ResponseSearchScope {
	brandId: string;
	fromDate: string;
	toDate: string;
	timezone: string;
	promptIds: string[];
	model?: string;
	query?: string;
}

export interface ResponseMatchRow {
	id: string;
	prompt_id: string;
	model: string;
	provider: string | null;
	version: string;
	web_queries: string[];
	brand_mentioned: boolean;
	competitors_mentioned: string[];
	raw_output: unknown;
	text_content: string | null;
	created_at: string;
	/** Every match in scope, not just this page — counted in the same scan. */
	matched: number;
}

function responseScopeFilter(scope: ResponseSearchScope): SQL {
	return sql`pr.brand_id = ${scope.brandId}
		AND pr.created_at >= ${windowStart(scope.fromDate, scope.timezone)}
		AND pr.created_at < ${windowEnd(scope.toDate, scope.timezone)}
		AND pr.prompt_id IN (${uuidList(scope.promptIds)})
		${modelFilter(scope.model, { alias: "pr" })}`;
}

/**
 * Answers are stored only as each provider's raw JSON, so the search runs over
 * that text. The term is JSON-escaped first so quotes and backslashes match
 * how they're stored, then LIKE-escaped so `%` and `_` are literal.
 */
function responseMatch(scope: ResponseSearchScope): SQL {
	if (!scope.query) return sql`TRUE`;
	const stored = JSON.stringify(scope.query).slice(1, -1);
	const pattern = `%${stored.replace(/[\\%_]/g, "\\$&")}%`;
	return sql`pr.raw_output::text ILIKE ${pattern}`;
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
			pr.brand_mentioned,
			pr.competitors_mentioned,
			pr.raw_output,
			pr.text_content,
			pr.created_at,
			count(*) OVER ()::int AS matched
		FROM prompt_runs pr
		WHERE ${responseScopeFilter(scope)} AND ${responseMatch(scope)}
		ORDER BY pr.created_at DESC, pr.id
		LIMIT ${limit} OFFSET ${offset}
	`);
}
