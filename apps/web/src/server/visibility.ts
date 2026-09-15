/** Server functions for visibility and chart data. */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getBatchChartData, type ProcessedBatchChartDataPoint } from "@/lib/analytics-read";
import { requireBrandSession } from "@/lib/auth/helpers";
import { type LookbackPeriod, lookbackSchema } from "@/lib/lookback";
import { getBrandVisibility } from "@/server/analytics-core";
import { resolveBrandWindow } from "@/server/brand-window";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

export interface BatchChartDataResponse {
	chartData: ProcessedBatchChartDataPoint[];
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

interface VisibilityTimeSeriesPoint {
	date: string;
	visibility: number | null;
}

export interface FilteredVisibilityResponse {
	/** Whole-number percentage. The shared computation answers in ratios. */
	currentVisibility: number;
	totalRuns: number;
	totalPrompts: number;
	totalCitations: number;
	visibilityTimeSeries: VisibilityTimeSeriesPoint[];
	lookback: LookbackPeriod;
}

export const getBatchChartDataFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			lookback: lookbackSchema.default("1m"),
			model: z.string().optional(),
			tags: z.string().optional(),
			search: z.string().optional(),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<BatchChartDataResponse> => {
		await requireBrandSession(data.brandId);

		const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(data.brandId, data.lookback, data.timezone);

		// Resolve the in-scope prompts server-side from the filter criteria so
		// the client never ships the full prompt-id list (issue #68).
		const resolvedPrompts = await resolveFilteredPrompts(data.brandId, {
			tags: data.tags,
			search: data.search,
		});
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

		// No prompts match the current filters — return an empty-but-valid
		// payload rather than erroring (the page renders an empty state).
		if (promptIds.length === 0) {
			return {
				chartData: [],
				brand: { id: brand.id, name: brand.name },
				competitors: competitorsResult,
				dateRange: { fromDate: fromDateStr, toDate: toDateStr },
			};
		}

		const chartData = await getBatchChartData(
			data.brandId,
			promptIds,
			fromDateStr,
			toDateStr,
			timezone,
			undefined,
			data.model,
		);

		return {
			chartData,
			brand: { id: brand.id, name: brand.name },
			competitors: competitorsResult,
			dateRange: {
				fromDate: fromDateStr,
				toDate: toDateStr,
			},
		};
	});

export const getFilteredVisibilityFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			lookback: lookbackSchema.default("1m"),
			model: z.string().optional(),
			tags: z.string().optional(),
			search: z.string().optional(),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<FilteredVisibilityResponse> => {
		await requireBrandSession(data.brandId);

		const lookback = data.lookback;
		// The same window as the chart section, so the visibility bar cannot read
		// a different slice of history than the chart beside it.
		const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(data.brandId, lookback, data.timezone);

		const result = await getBrandVisibility(
			data.brandId,
			{ from: fromDateStr, to: toDateStr, timezone },
			{ model: data.model, tags: data.tags, search: data.search },
		);

		// The single place the dashboard converts the shared ratios to percentages.
		const asPercent = (ratio: number | null) => (ratio === null ? null : Math.round(ratio * 100));
		return {
			// The hero renders a percentage, so "no runs to plot" has to arrive as a
			// number rather than the null the shared function returns.
			currentVisibility: asPercent(result.currentVisibility) ?? 0,
			totalRuns: result.totalRuns,
			totalPrompts: result.totalPrompts,
			totalCitations: result.totalCitations,
			visibilityTimeSeries: result.series.map((point) => ({ ...point, visibility: asPercent(point.visibility) })),
			lookback,
		};
	});
