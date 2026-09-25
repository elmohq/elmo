/** Server functions for the Responses page. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { lookbackSchema } from "@/lib/lookback";
import { RESPONSES_PAGE_SIZE } from "@/lib/responses";
import { resolveLookbackRange } from "@/lib/timezone-utils";
import { findBrandRunDetail, type ResponseSearchResult, searchBrandResponses } from "@/server/responses-core";

export const searchResponsesFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			query: z.string().max(500).optional(),
			lookback: lookbackSchema.default("1m"),
			model: z.string().optional(),
			tags: z.string().optional(),
			page: z.number().int().min(0).default(0),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<ResponseSearchResult> => {
		await requireBrandSession(data.brandId);

		const { timezone, fromDateStr, toDateStr } = resolveLookbackRange(data.lookback, data.timezone);
		return searchBrandResponses(data.brandId, {
			from: fromDateStr,
			to: toDateStr,
			timezone,
			query: data.query,
			filters: { model: data.model, tags: data.tags },
			limit: RESPONSES_PAGE_SIZE,
			offset: data.page * RESPONSES_PAGE_SIZE,
		});
	});

export const getResponseDetailFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), runId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const run = await findBrandRunDetail(data.brandId, data.runId);
		if (!run) return null;
		return {
			id: run.id,
			promptId: run.promptId,
			model: run.model,
			createdAt: new Date(run.createdAt).toISOString(),
			brandMentioned: Boolean(run.brandMentioned),
			competitorsMentioned: [...new Set((run.competitorsMentioned as string[] | null) ?? [])],
			webQueries: [...new Set((run.webQueries as string[] | null) ?? [])],
			text: run.answer.text,
			citations: run.citations,
		};
	});
