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
import {
	getFanoutBreakdown,
	getFanoutModelTotals,
	getFanoutPromptTotals,
	getGoogleSearchFanoutCitations,
} from "@/lib/postgres-read";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";
import {
	computeFanoutAnalysis,
	deriveGoogleFanout,
	type FanoutAnalysis,
	type FanoutModelTotalRow,
} from "@/lib/fanout-analysis";

const LOOKBACK = z.enum(["1w", "1m", "3m", "6m", "1y", "all"]);

/** Engines whose fan-out isn't in `web_queries` but is reconstructable from cited Google searches. */
const GOOGLE_FANOUT_MODELS = ["google-ai-mode", "google-ai-overview"] as const;

export interface QueryFanoutResponse extends FanoutAnalysis {
	brandName: string;
	model: string | null;
	/** Models whose fan-out was reconstructed from citations rather than read from `web_queries`. */
	reconstructedModels: string[];
}

function resolveRange(lookback: LookbackPeriod, timezoneParam: string) {
	const timezone = resolveTimezone(timezoneParam);
	const { fromDateStr, toDateStr } = getTimezoneLookbackRange(lookback, timezone, { allStrategy: "1y" }) as {
		fromDateStr: string;
		toDateStr: string;
	};
	return { timezone, fromDateStr, toDateStr };
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
		modelsWithoutFanout: [],
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

		// Google AI Mode's `web_queries` is the echoed prompt, not a fan-out. Replace
		// its model totals with the citation-reconstructed counts where we have them,
		// and zero out any Google model with no reconstructed searches.
		const google = deriveGoogleFanout(googleCitations, promptValueMap);
		const allBreakdown = [...breakdown, ...google.rows];
		const googleSet = new Set<string>(GOOGLE_FANOUT_MODELS);
		const patchedTotals: FanoutModelTotalRow[] = modelTotals.map((m) => {
			const g = google.totalsByModel.get(m.model);
			if (g) return { ...m, fanout_runs: g.fanoutRuns, total_queries: g.totalQueries };
			if (googleSet.has(m.model)) return { ...m, fanout_runs: 0, total_queries: 0 };
			return m;
		});
		for (const [model_, g] of google.totalsByModel) {
			if (!patchedTotals.some((m) => m.model === model_)) {
				patchedTotals.push({ model: model_, runs: g.fanoutRuns, fanout_runs: g.fanoutRuns, total_queries: g.totalQueries });
			}
		}
		const reconstructedModels = [...google.totalsByModel.entries()]
			.filter(([, g]) => g.totalQueries > 0)
			.map(([m]) => m);

		const promptRuns = new Map(promptTotalsRows.map((r) => [r.prompt_id, r.runs]));
		const analysis = computeFanoutAnalysis(allBreakdown, patchedTotals, promptValueMap, { promptRuns });

		return { brandName, model: model ?? null, ...analysis, reconstructedModels };
	});
