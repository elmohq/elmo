/**
 * Server function for the Query Fanout page. Read-only — derived entirely from
 * `prompt_runs.web_queries` (the sub-queries engines run while answering a
 * prompt), uniformly across providers. Engines that don't expose their
 * searches contribute runs but no queries. No schema changes.
 *
 * Filters (tags/search → prompt IDs, lookback → date range in the user's
 * timezone) are resolved server-side exactly like Share of Voice, so the same
 * prompt set and window back every figure on the page. See `server/analysis.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import type { LookbackPeriod } from "@/lib/chart-utils";
import type { FanoutAnalysis } from "@/lib/fanout-analysis";
import { LOOKBACK, resolveRange } from "@/server/analysis";
import { getBrandQueryFanout } from "@/server/analytics-core";

export interface QueryFanoutResponse extends FanoutAnalysis {
	brandName: string;
	model: string | null;
}

function _emptyResponse(brandName: string, model: string | null): QueryFanoutResponse {
	return {
		brandName,
		model,
		totalQueries: 0,
		uniqueQueries: 0,
		fanoutRuns: 0,
		totalRuns: 0,
		avgPerExecution: 0,
		coverageRate: 0,
		topQueries: [],
		terms: [],
		wordChanges: { added: [], dropped: [], preserved: [] },
		byModel: [],
		byPrompt: [],
		topByPrompts: [],
		topByRuns: [],
	};
}

export const getQueryFanoutFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			lookback: LOOKBACK.default("1m"),
			model: z.string().optional(),
			tags: z.string().optional(),
			search: z.string().optional(),
			/** Scope to a single prompt (prompt-details Web Queries tab) — lists come back uncapped. */
			promptId: z.string().optional(),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<QueryFanoutResponse> => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const { timezone, fromDateStr, toDateStr } = resolveRange(data.lookback as LookbackPeriod, data.timezone);
		const analysis = await getBrandQueryFanout(
			data.brandId,
			{ startDate: fromDateStr, endDate: toDateStr, timezone },
			{ model: data.model, tags: data.tags, search: data.search },
			{ promptId: data.promptId },
		);

		return { ...analysis, model: data.model ?? null };
	});
