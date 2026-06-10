/**
 * Server function for the Query Fanout page. Read-only — derived from existing
 * `prompt_runs.web_queries` (the sub-queries engines run while answering a
 * prompt) plus, for Google AI Mode, the `google.com/search?q=` links it cites.
 * No schema changes.
 *
 * Filters (tags/search → prompt IDs, lookback → date range in the user's
 * timezone) are resolved server-side exactly like Share of Voice, so the same
 * prompt set and window back every figure on the page. See `server/analysis.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import type { LookbackPeriod } from "@/lib/chart-utils";
import { LOOKBACK, resolveRange } from "@/server/analysis";
import {
	getFanoutBreakdown,
	getFanoutModelTotals,
	getFanoutPromptTotals,
	getGoogleSearchFanoutCitations,
} from "@/lib/postgres-read";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";
import {
	computeFanoutAnalysis,
	deriveGoogleFanout,
	mergeGoogleFanout,
	type FanoutAnalysis,
} from "@/lib/fanout-analysis";

/** Engines whose fan-out isn't in `web_queries` but is reconstructable from cited Google searches. */
const GOOGLE_FANOUT_MODELS = ["google-ai-mode", "google-ai-overview"] as const;

export interface QueryFanoutResponse extends FanoutAnalysis {
	brandName: string;
	model: string | null;
	/** Models whose fan-out was reconstructed from citations rather than read from `web_queries`. */
	reconstructedModels: string[];
}

function emptyResponse(brandName: string, model: string | null): QueryFanoutResponse {
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
		invisibleQueries: [],
		wonQueries: [],
		reconstructedModels: [],
	};
}

/** Which Google models to look up citations for, honoring the model filter. */
function citationModelsFor(model: string | undefined): string[] {
	if (!model) return [...GOOGLE_FANOUT_MODELS];
	return (GOOGLE_FANOUT_MODELS as readonly string[]).includes(model) ? [model] : [];
}

export const getQueryFanoutFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			lookback: LOOKBACK.default("1m"),
			model: z.string().optional(),
			tags: z.string().optional(),
			search: z.string().optional(),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<QueryFanoutResponse> => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const { timezone, fromDateStr, toDateStr } = resolveRange(data.lookback as LookbackPeriod, data.timezone);
		const model = data.model;

		const [brandRow, resolved] = await Promise.all([
			db.select({ name: brands.name }).from(brands).where(eq(brands.id, data.brandId)).limit(1),
			resolveFilteredPrompts(data.brandId, { tags: data.tags, search: data.search }),
		]);
		const brandName = brandRow[0]?.name ?? "Your brand";
		const promptIds = resolved.map((p) => p.id);
		if (promptIds.length === 0) return emptyResponse(brandName, model ?? null);

		const promptValueMap = new Map(resolved.map((p) => [p.id, p.value]));
		const citationModels = citationModelsFor(model);

		const [breakdown, modelTotals, promptTotalsRows, googleCitations] = await Promise.all([
			getFanoutBreakdown(data.brandId, fromDateStr, toDateStr, timezone, promptIds, model),
			getFanoutModelTotals(data.brandId, fromDateStr, toDateStr, timezone, promptIds, model),
			getFanoutPromptTotals(data.brandId, fromDateStr, toDateStr, timezone, promptIds, model),
			getGoogleSearchFanoutCitations(data.brandId, fromDateStr, toDateStr, timezone, promptIds, citationModels),
		]);

		// DataForSEO's Google AI Mode echoes the prompt in `web_queries` (filtered out
		// upstream) and exposes its real searches only as `google.com/search` citations;
		// Olostep's Google runs carry genuine `web_queries`. Reconstruct the former from
		// citations and ADD it to the web_queries-derived totals so neither is dropped.
		const google = deriveGoogleFanout(googleCitations, promptValueMap);
		const allBreakdown = [...breakdown, ...google.rows];
		const { modelTotals: patchedTotals, promptRuns, reconstructedModels } = mergeGoogleFanout(
			modelTotals,
			promptTotalsRows,
			google,
		);

		const analysis = computeFanoutAnalysis(allBreakdown, patchedTotals, promptValueMap, { promptRuns });

		return { brandName, model: model ?? null, ...analysis, reconstructedModels };
	});
