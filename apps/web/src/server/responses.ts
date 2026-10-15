import { createServerFn } from "@tanstack/react-start";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { lookbackSchema } from "@/lib/lookback";
import { getResponseMatches, getResponseToneCounts, type ResponseSearchScope } from "@/lib/postgres-read";
import { getMentionTotals } from "@/lib/rollup-read";
import { responseSortSchema, toneFilterSchema } from "@/lib/tone";
import { resolveBrandWindow } from "@/server/brand-window";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

const PAGE_SIZE = 15;

export const searchResponsesFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			query: z.string().max(500).optional(),
			lookback: lookbackSchema.default("1m"),
			model: z.string().optional(),
			tags: z.string().optional(),
			/** Comma-joined prompt IDs; absent means every prompt. */
			prompts: z.string().optional(),
			sentiment: toneFilterSchema.optional(),
			sort: responseSortSchema.default("newest"),
			page: z.number().int().min(0).default(0),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		const query = data.query?.trim() || undefined;
		const picked = data.prompts ? new Set(data.prompts.split(",")) : null;
		const prompts = (await resolveFilteredPrompts(data.brandId, { tags: data.tags })).filter(
			(prompt) => !picked || picked.has(prompt.id),
		);
		const promptValues = new Map(prompts.map((prompt) => [prompt.id, prompt.value]));
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

		const [totals, toneCounts, rows] = await Promise.all([
			getMentionTotals(scope),
			getResponseToneCounts(scope),
			getResponseMatches({ ...scope, tone: data.sentiment }, PAGE_SIZE, data.page * PAGE_SIZE, data.sort),
		]);

		return {
			query: query ?? null,
			totalRuns: totals.runs,
			matchedRuns: rows[0]?.matched ?? 0,
			/** The search's matches by tone, before the sentiment filter narrows them. */
			toneCounts,
			pageSize: PAGE_SIZE,
			matches: rows.map((row) => ({
				id: row.id,
				promptId: row.prompt_id,
				promptValue: promptValues.get(row.prompt_id) ?? "",
				model: row.model,
				provider: row.provider,
				version: row.version,
				webQueries: row.web_queries ?? [],
				brandMentioned: row.brand_mentioned,
				competitorsMentioned: row.competitors_mentioned ?? [],
				// Evidence offsets index the stored text, so they mean nothing against re-extracted text.
				mentionAssessments: row.text_content === null ? null : row.assessments,
				rawOutput: row.raw_output as {},
				// Older rows carry no text and may predate the provider column; the
				// extractor also accepts the model name.
				textContent: row.text_content ?? extractTextContent(row.raw_output, row.provider ?? row.model),
				createdAt: new Date(row.created_at).toISOString(),
			})),
		};
	});
