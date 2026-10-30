import { createServerFn } from "@tanstack/react-start";
import { extractorFor, extractTextContent } from "@workspace/lib/text-extraction";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { lookbackSchema } from "@/lib/lookback";
import {
	getResponseMatches,
	getResponseSentimentCounts,
	type ResponseMatchRow,
	type ResponseSearchScope,
} from "@/lib/postgres-read";
import { getMentionTotals } from "@/lib/rollup-read";
import { responseSortSchema, sentimentFilterSchema } from "@/lib/sentiment";
import { resolveBrandWindow } from "@/server/brand-window";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

const PAGE_SIZE = 15;

/** What narrows a search: everything but the sentiment filter, sort and page. */
const searchScopeSchema = z.object({
	brandId: z.string(),
	query: z.string().max(500).optional(),
	lookback: lookbackSchema.default("1m"),
	model: z.string().optional(),
	tags: z.string().optional(),
	/** Comma-joined prompt IDs; absent means every prompt. */
	prompts: z.string().optional(),
	timezone: z.string().default("UTC"),
});

async function resolveSearch(data: z.infer<typeof searchScopeSchema>) {
	await requireBrandSession(data.brandId);
	const query = data.query?.trim() || undefined;
	const picked = data.prompts ? new Set(data.prompts.split(",")) : null;
	const prompts = (await resolveFilteredPrompts(data.brandId, { tags: data.tags })).filter(
		(prompt) => !picked || picked.has(prompt.id),
	);
	const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(data.brandId, data.lookback, data.timezone);
	const scope: ResponseSearchScope = {
		brandId: data.brandId,
		from: fromDateStr,
		to: toDateStr,
		timezone,
		promptIds: prompts.map((prompt) => prompt.id),
		model: data.model,
		query,
	};
	return { scope, prompts };
}

export const searchResponsesFn = createServerFn({ method: "GET" })
	.validator(
		searchScopeSchema.extend({
			sentiment: sentimentFilterSchema.optional(),
			sort: responseSortSchema.default("newest"),
			page: z.number().int().min(0).default(0),
		}),
	)
	.handler(async ({ data }) => {
		const { scope, prompts } = await resolveSearch(data);
		const promptValues = new Map(prompts.map((prompt) => [prompt.id, prompt.value]));
		const [totals, rows] = await Promise.all([
			getMentionTotals(scope),
			getResponseMatches({ ...scope, sentiment: data.sentiment }, PAGE_SIZE, data.page * PAGE_SIZE, data.sort),
		]);
		return {
			query: scope.query ?? null,
			totalRuns: totals.runs,
			matchedRuns: rows[0]?.matched ?? 0,
			pageSize: PAGE_SIZE,
			matches: rows.map((row) => ({ ...toResponse(row), promptValue: promptValues.get(row.prompt_id) ?? "" })),
		};
	});

/** Separate from the search so paging, sorting or picking a sentiment doesn't scan the window again. */
export const getResponseSentimentCountsFn = createServerFn({ method: "GET" })
	.validator(searchScopeSchema)
	.handler(async ({ data }) => getResponseSentimentCounts((await resolveSearch(data)).scope));

export function toResponse(row: ResponseMatchRow) {
	return {
		id: row.id,
		promptId: row.prompt_id,
		model: row.model,
		provider: row.provider,
		version: row.version,
		webQueries: row.web_queries ?? [],
		brandMentioned: row.brand_mentioned,
		competitorsMentioned: row.competitors_mentioned ?? [],
		mentionAssessments: row.assessments,
		rawOutput: row.raw_output as {},
		textContent: row.text_content ?? extractTextContent(row.raw_output, extractorFor(row)),
		createdAt: new Date(row.created_at).toISOString(),
	};
}
