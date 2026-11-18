/** Server functions for visibility and chart data. */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { toBatchChartColumns, toBatchChartData } from "@/lib/chart-utils";
import { lookbackSchema } from "@/lib/lookback";
import { getPerPromptDailyCompetitors, getPerPromptDailyRuns } from "@/lib/rollup-read";
import { resolveBrandWindow } from "@/server/brand-window";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

export interface BatchChartDataResponse {
	/**
	 * `BatchChartColumns` as JSON text. The server-function encoding wraps every
	 * number in an object of its own, which made this response several megabytes.
	 */
	chartData: string;
	brand: {
		id: string;
		name: string;
	};
	competitors: Array<{
		id: string;
		name: string;
	}>;
	dateRange: {
		fromDate: string;
		toDate: string;
	};
}

export const getBatchChartDataFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			lookback: lookbackSchema.default("1m"),
			model: z.string().optional(),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<BatchChartDataResponse> => {
		await requireBrandSession(data.brandId);

		const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(data.brandId, data.lookback, data.timezone);

		const resolvedPrompts = await resolveFilteredPrompts(data.brandId, {});
		const promptIds = resolvedPrompts.map((p) => p.id);

		const [brandResult, competitorsResult] = await Promise.all([
			db.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.id, data.brandId)).limit(1),
			db
				.select({ id: competitors.id, name: competitors.name })
				.from(competitors)
				.where(eq(competitors.brandId, data.brandId)),
		]);

		if (brandResult.length === 0) {
			throw new Error("Brand not found");
		}

		const brand = brandResult[0];

		// A brand with no enabled prompts gets an empty-but-valid payload rather
		// than an error (the page renders an empty state).
		if (promptIds.length === 0) {
			return {
				chartData: JSON.stringify(toBatchChartColumns([])),
				brand: { id: brand.id, name: brand.name },
				competitors: competitorsResult,
				dateRange: { fromDate: fromDateStr, toDate: toDateStr },
			};
		}

		const scope = { brandId: data.brandId, from: fromDateStr, to: toDateStr, timezone, promptIds, model: data.model };
		const [runs, competitorRuns] = await Promise.all([
			getPerPromptDailyRuns(scope),
			getPerPromptDailyCompetitors(scope),
		]);

		return {
			chartData: JSON.stringify(toBatchChartColumns(toBatchChartData(runs, competitorRuns))),
			brand: { id: brand.id, name: brand.name },
			competitors: competitorsResult,
			dateRange: {
				fromDate: fromDateStr,
				toDate: toDateStr,
			},
		};
	});
