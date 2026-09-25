/**
 * Full-text search across every stored answer for a brand, plus the analysis
 * of what matched. Like `analytics-core`, the caller has already decided the
 * requester may see the brand.
 */
import { db } from "@workspace/lib/db/db";
import { promptRuns } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { generateDateRange } from "@/lib/chart-utils";
import {
	getResponseCompetitorCounts,
	getResponseDailyModelCounts,
	getResponseMatches,
	getResponsePromptCounts,
	hasUnindexedResponses,
	type ResponseSearchScope,
} from "@/lib/postgres-read";
import type { AnalyticsFilters } from "@/server/analytics-core";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";
import { findRunDetail, type RunDetail } from "@/server/runs-core";

export interface ResponseMatch {
	id: string;
	promptId: string;
	promptValue: string;
	model: string;
	brandMentioned: boolean;
	competitorsMentioned: string[];
	createdAt: string;
	snippet: string | null;
}

export interface ResponseSearchResult {
	query: string | null;
	totalRuns: number;
	matchedRuns: number;
	/** Share of matching runs that mention the brand, 0..1; null with no matches. */
	brandMentionRate: number | null;
	series: Array<{ date: string; runs: number; matched: number }>;
	byModel: Array<{ model: string; runs: number; matched: number }>;
	byPrompt: Array<{ promptId: string; promptValue: string; runs: number; matched: number }>;
	competitors: Array<{ name: string; matched: number }>;
	matches: ResponseMatch[];
	/** True while older runs in scope haven't been indexed yet, so they can't match a query. */
	indexing: boolean;
}

export interface ResponseSearchOptions {
	/** Calendar days (`YYYY-MM-DD`) in `timezone`, both inclusive. */
	from: string;
	to: string;
	timezone: string;
	query?: string;
	filters?: Pick<AnalyticsFilters, "model" | "tags">;
	limit: number;
	offset: number;
}

export async function searchBrandResponses(
	brandId: string,
	options: ResponseSearchOptions,
): Promise<ResponseSearchResult> {
	const query = options.query?.trim() || undefined;
	const prompts = await resolveFilteredPrompts(brandId, { tags: options.filters?.tags });
	const promptValues = new Map(prompts.map((prompt) => [prompt.id, prompt.value]));
	const scope: ResponseSearchScope = {
		brandId,
		fromDate: options.from,
		toDate: options.to,
		timezone: options.timezone,
		promptIds: prompts.map((prompt) => prompt.id),
		model: options.filters?.model,
		query,
	};

	const [daily, promptRows, competitorRows, matchRows, indexing] = await Promise.all([
		getResponseDailyModelCounts(scope),
		getResponsePromptCounts(scope),
		getResponseCompetitorCounts(scope),
		getResponseMatches(scope, options.limit, options.offset),
		hasUnindexedResponses(scope),
	]);

	let totalRuns = 0;
	let matchedRuns = 0;
	let matchedMentioned = 0;
	const byDate = new Map<string, { runs: number; matched: number }>();
	const byModel = new Map<string, { runs: number; matched: number }>();
	for (const row of daily) {
		totalRuns += row.runs;
		matchedRuns += row.matched;
		matchedMentioned += row.matched_brand_mentioned;
		for (const [map, key] of [
			[byDate, row.date],
			[byModel, row.model],
		] as const) {
			const entry = map.get(key) ?? { runs: 0, matched: 0 };
			entry.runs += row.runs;
			entry.matched += row.matched;
			map.set(key, entry);
		}
	}

	const series = generateDateRange(new Date(`${options.from}T00:00:00Z`), new Date(`${options.to}T00:00:00Z`)).map(
		(date) => ({ date, ...(byDate.get(date) ?? { runs: 0, matched: 0 }) }),
	);

	return {
		query: query ?? null,
		totalRuns,
		matchedRuns,
		brandMentionRate: matchedRuns > 0 ? matchedMentioned / matchedRuns : null,
		series,
		byModel: [...byModel]
			.map(([model, counts]) => ({ model, ...counts }))
			.sort((a, b) => b.matched - a.matched || b.runs - a.runs),
		byPrompt: promptRows.map((row) => ({
			promptId: row.prompt_id,
			promptValue: promptValues.get(row.prompt_id) ?? "",
			runs: row.runs,
			matched: row.matched,
		})),
		competitors: competitorRows.map((row) => ({ name: row.competitor, matched: row.matched })),
		matches: matchRows.map((row) => ({
			id: row.id,
			promptId: row.prompt_id,
			promptValue: promptValues.get(row.prompt_id) ?? "",
			model: row.model,
			brandMentioned: row.brand_mentioned,
			competitorsMentioned: [...new Set(row.competitors_mentioned ?? [])],
			createdAt: new Date(row.created_at).toISOString(),
			snippet: row.snippet,
		})),
		indexing,
	};
}

/**
 * A run addressed through its brand, so a run id cannot be read under another.
 * The answer is the indexed text where there is one, so what opens is exactly
 * what the search matched.
 */
export async function findBrandRunDetail(brandId: string, runId: string): Promise<RunDetail | null> {
	const [run] = await db
		.select({ promptId: promptRuns.promptId, textContent: promptRuns.textContent })
		.from(promptRuns)
		.where(and(eq(promptRuns.id, runId), eq(promptRuns.brandId, brandId)))
		.limit(1);
	if (!run) return null;
	const detail = await findRunDetail(run.promptId, runId);
	if (!detail || !run.textContent) return detail;
	return { ...detail, answer: { text: run.textContent } };
}
