/**
 * Server functions for visibility and chart data.
 * Replaces:
 *   - apps/web/src/app/api/brands/[id]/batch-chart-data/route.ts
 *   - apps/web/src/app/api/brands/[id]/filtered-visibility/route.ts
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { type LookbackPeriod } from "@/lib/chart-utils";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";
import {
	getBatchChartData,
	getBatchVisibilityData,
	getVisibilityDailyAggregate,
	getCitationsTotalCount,
	type ProcessedBatchChartDataPoint,
} from "@/lib/postgres-read";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";

// ============================================================================
// Types
// ============================================================================

export interface BatchChartDataResponse {
	chartData: ProcessedBatchChartDataPoint[];
	visibility: {
		currentVisibility: number;
		totalRuns: number;
		visibilityTimeSeries: Array<{
			date: string;
			total_runs: number;
			brand_mentioned_count: number;
			is_branded: boolean;
		}>;
	};
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

export interface VisibilityTimeSeriesPoint {
	date: string;
	visibility: number | null;
}

export interface FilteredVisibilityResponse {
	currentVisibility: number;
	totalRuns: number;
	totalPrompts: number;
	totalCitations: number;
	visibilityTimeSeries: VisibilityTimeSeriesPoint[];
	lookback: LookbackPeriod;
}

// ============================================================================
// Server functions
// ============================================================================

export const getBatchChartDataFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			lookback: z.enum(["1w", "1m", "3m", "6m", "1y", "all"]).default("1m"),
			model: z.string().optional(),
			promptIds: z.array(z.string()),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<BatchChartDataResponse> => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const timezone = resolveTimezone(data.timezone);
		const lookbackParam = data.lookback as LookbackPeriod;

		const { fromDateStr, toDateStr } = getTimezoneLookbackRange(lookbackParam, timezone, {
			allStrategy: "1y",
		});

		if (data.promptIds.length === 0) {
			throw new Error("promptIds parameter is required");
		}

		// Get brand and competitors from PostgreSQL
		const [brandResult, competitorsResult, promptsResult] = await Promise.all([
			db
				.select({ id: brands.id, name: brands.name })
				.from(brands)
				.where(eq(brands.id, data.brandId))
				.limit(1),
			db
				.select({ id: competitors.id, name: competitors.name })
				.from(competitors)
				.where(eq(competitors.brandId, data.brandId)),
			db
				.select({ id: prompts.id, value: prompts.value })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), inArray(prompts.id, data.promptIds))),
		]);

		if (brandResult.length === 0) {
			throw new Error("Brand not found");
		}

		const brand = brandResult[0];

		// Determine branded prompt IDs
		const brandedPromptIds = promptsResult
			.filter((p) => p.value.toLowerCase().includes(brand.name.toLowerCase()))
			.map((p) => p.id);

		// Fetch batch chart data and visibility data in parallel
		const [chartData, visibilityData] = await Promise.all([
			getBatchChartData(
				data.brandId,
				data.promptIds,
				fromDateStr,
				toDateStr,
				timezone,
				undefined,
				data.model,
			),
			getBatchVisibilityData(
				data.brandId,
				data.promptIds,
				brandedPromptIds,
				fromDateStr,
				toDateStr,
				timezone,
			),
		]);

		const currentVisibility =
			visibilityData.totalRuns > 0
				? Math.round((visibilityData.totalMentioned / visibilityData.totalRuns) * 100)
				: 0;

		return {
			chartData,
			visibility: {
				currentVisibility,
				totalRuns: visibilityData.totalRuns,
				visibilityTimeSeries: visibilityData.visibilityTimeSeries,
			},
			brand: { id: brand.id, name: brand.name },
			competitors: competitorsResult,
			dateRange: {
				fromDate: fromDateStr!,
				toDate: toDateStr!,
			},
		};
	});

export const getFilteredVisibilityFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			lookback: z.enum(["1w", "1m", "3m", "6m", "1y", "all"]).default("1m"),
			model: z.string().optional(),
			promptIds: z.array(z.string()).default([]),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<FilteredVisibilityResponse> => {
		const session = await requireAuthSession();
		const lookbackParam = data.lookback as LookbackPeriod;

		await requireOrgAccess(session.user.id, data.brandId);

		if (data.promptIds.length === 0) {
			return {
				currentVisibility: 0,
				totalRuns: 0,
				totalPrompts: 0,
				totalCitations: 0,
				visibilityTimeSeries: [],
				lookback: lookbackParam,
			};
		}

		const timezone = resolveTimezone(data.timezone);

		// Get brand name and prompt values for branded/non-branded determination
		const [brandResult, promptsResult] = await Promise.all([
			db.select({ name: brands.name }).from(brands).where(eq(brands.id, data.brandId)).limit(1),
			db
				.select({
					id: prompts.id,
					value: prompts.value,
					systemTags: prompts.systemTags,
					tags: prompts.tags,
				})
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), inArray(prompts.id, data.promptIds))),
		]);

		const totalPrompts = promptsResult.length;

		if (totalPrompts === 0) {
			return {
				currentVisibility: 0,
				totalRuns: 0,
				totalPrompts: 0,
				totalCitations: 0,
				visibilityTimeSeries: [],
				lookback: lookbackParam,
			};
		}

		// Determine branded prompt IDs
		const brandedPromptIds = promptsResult
			.filter((p) => {
				const effectiveStatus = getEffectiveBrandedStatus(p.systemTags || [], p.tags || []);
				return effectiveStatus.isBranded;
			})
			.map((p) => p.id);

		// Concrete bounds for the SQL aggregate. `getTimezoneLookbackRange`
		// returns null for "all"; the chart side already caps that to a one-
		// year window via allStrategy so the visibility bar matches.
		const { fromDateStr: fromDate, toDateStr: toDate } = getTimezoneLookbackRange(lookbackParam, timezone, {
			allStrategy: "1y",
		});
		if (!fromDate || !toDate) {
			return {
				currentVisibility: 0,
				totalRuns: 0,
				totalPrompts,
				totalCitations: 0,
				visibilityTimeSeries: [],
				lookback: lookbackParam,
			};
		}

		const [daily, totalCitations] = await Promise.all([
			getVisibilityDailyAggregate(
				data.brandId,
				fromDate,
				toDate,
				timezone,
				data.promptIds,
				brandedPromptIds,
				data.model,
			),
			getCitationsTotalCount(data.brandId, fromDate, toDate, timezone, data.promptIds, data.model),
		]);

		// Roll actual totals across the period (LVCF values are display-only);
		// build the time-series from per-day LVCF sums.
		let totalBrandedRuns = 0;
		let totalBrandedMentioned = 0;
		let totalNonBrandedRuns = 0;
		let totalNonBrandedMentioned = 0;
		const visibilityTimeSeries: VisibilityTimeSeriesPoint[] = daily.map((row) => {
			totalBrandedRuns += row.actual_branded_runs;
			totalBrandedMentioned += row.actual_branded_mentioned;
			totalNonBrandedRuns += row.actual_nonbranded_runs;
			totalNonBrandedMentioned += row.actual_nonbranded_mentioned;
			const t = row.lvcf_branded_runs + row.lvcf_nonbranded_runs;
			const m = row.lvcf_branded_mentioned + row.lvcf_nonbranded_mentioned;
			return { date: row.date, visibility: t === 0 ? null : Math.round((m / t) * 100) };
		});

		const totalRuns = totalBrandedRuns + totalNonBrandedRuns;
		const totalMentioned = totalBrandedMentioned + totalNonBrandedMentioned;
		const currentVisibility = totalRuns > 0 ? Math.round((totalMentioned / totalRuns) * 100) : 0;

		return {
			currentVisibility,
			totalRuns,
			totalPrompts,
			totalCitations,
			visibilityTimeSeries,
			lookback: lookbackParam,
		};
	});
