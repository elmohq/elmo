import { z } from "zod";
import { resolveBrandWindow } from "@/lib/analytics/brand-window";
import { getBrandVisibility } from "@/lib/analytics/core";
import { resolveFilteredPrompts } from "@/lib/analytics/prompt-resolution";
import type { AnalyticsReader } from "@/lib/analytics/reader";
import { type ProcessedBatchChartDataPoint, toBatchChartData } from "@/lib/chart-utils";
import { type LookbackPeriod, lookbackSchema } from "@/lib/lookback";

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

export const visibilityInput = z.object({
	brandId: z.string(),
	lookback: lookbackSchema.default("1m"),
	model: z.string().optional(),
	tags: z.string().optional(),
	search: z.string().optional(),
	timezone: z.string().default("UTC"),
});

export async function computeBatchChartData(
	reader: AnalyticsReader,
	input: z.input<typeof visibilityInput>,
): Promise<BatchChartDataResponse> {
	const data = visibilityInput.parse(input);
	const [{ timezone, fromDateStr, toDateStr }, resolvedPrompts, brand, competitorRows] = await Promise.all([
		resolveBrandWindow(reader, data.brandId, data.lookback, data.timezone),
		resolveFilteredPrompts(reader, data.brandId, { tags: data.tags, search: data.search }),
		reader.getBrandRow(data.brandId),
		reader.getCompetitorRows(data.brandId),
	]);
	if (!brand) throw new Error("Brand not found");
	const competitors = competitorRows.map((c) => ({ id: c.id, name: c.name }));
	const promptIds = resolvedPrompts.map((p) => p.id);
	const dateRange = { fromDate: fromDateStr, toDate: toDateStr };
	if (promptIds.length === 0) {
		return { chartData: [], brand: { id: brand.id, name: brand.name }, competitors, dateRange };
	}
	const scope = { brandId: data.brandId, from: fromDateStr, to: toDateStr, timezone, promptIds, model: data.model };
	const [runs, competitorRuns] = await Promise.all([
		reader.getPerPromptDailyRuns(scope),
		reader.getPerPromptDailyCompetitors(scope),
	]);
	return {
		chartData: toBatchChartData(runs, competitorRuns),
		brand: { id: brand.id, name: brand.name },
		competitors,
		dateRange,
	};
}

export async function computeFilteredVisibility(
	reader: AnalyticsReader,
	input: z.input<typeof visibilityInput>,
): Promise<FilteredVisibilityResponse> {
	const data = visibilityInput.parse(input);
	// Shares the chart's window so the visibility bar can't disagree with it.
	const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(
		reader,
		data.brandId,
		data.lookback,
		data.timezone,
	);
	const result = await getBrandVisibility(
		reader,
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
		lookback: data.lookback,
	};
}
