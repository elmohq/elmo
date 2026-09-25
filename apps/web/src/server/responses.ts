import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { lookbackSchema } from "@/lib/lookback";
import { countResponses, getResponseMatches, type ResponseSearchScope } from "@/lib/postgres-read";
import { resolveLookbackRange } from "@/lib/timezone-utils";
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
		const { timezone, fromDateStr, toDateStr } = resolveLookbackRange(data.lookback, data.timezone);
		const scope: ResponseSearchScope = {
			brandId: data.brandId,
			fromDate: fromDateStr,
			toDate: toDateStr,
			timezone,
			promptIds: prompts.map((prompt) => prompt.id),
			model: data.model,
			query,
		};

		const [totalRuns, rows] = await Promise.all([
			countResponses(scope),
			getResponseMatches(scope, PAGE_SIZE, data.page * PAGE_SIZE),
		]);

		return {
			query: query ?? null,
			totalRuns,
			matchedRuns: rows[0]?.matched ?? 0,
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
				rawOutput: row.raw_output as {},
				createdAt: new Date(row.created_at).toISOString(),
			})),
		};
	});
