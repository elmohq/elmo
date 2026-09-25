/**
 * Full-text search across every stored answer for a brand. Like
 * `analytics-core`, the caller has already decided the requester may see the
 * brand.
 */
import { extractTextContent } from "@workspace/lib/text-extraction";
import { getResponseCounts, getResponseMatches, type ResponseSearchScope } from "@/lib/postgres-read";
import type { AnalyticsFilters } from "@/server/analytics-core";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

export interface ResponseMatch {
	id: string;
	promptId: string;
	promptValue: string;
	model: string;
	version: string;
	webQueries: string[];
	brandMentioned: boolean;
	competitorsMentioned: string[];
	rawOutput: {};
	/** The answer as the search indexed it, so what shows is what matched. */
	text: string;
	createdAt: string;
}

export interface ResponseSearchResult {
	query: string | null;
	totalRuns: number;
	matchedRuns: number;
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

	const [counts, rows] = await Promise.all([
		getResponseCounts(scope),
		getResponseMatches(scope, options.limit, options.offset),
	]);

	return {
		query: query ?? null,
		totalRuns: counts.total,
		matchedRuns: counts.matched,
		indexing: counts.unindexed,
		matches: rows.map((row) => ({
			id: row.id,
			promptId: row.prompt_id,
			promptValue: promptValues.get(row.prompt_id) ?? "",
			model: row.model,
			version: row.version,
			webQueries: row.web_queries ?? [],
			brandMentioned: row.brand_mentioned,
			competitorsMentioned: row.competitors_mentioned ?? [],
			rawOutput: row.raw_output as {},
			// Older rows predate the provider column; the model name is the extractor's other accepted key.
			text: row.text_content || extractTextContent(row.raw_output, row.provider ?? row.model),
			createdAt: new Date(row.created_at).toISOString(),
		})),
	};
}
