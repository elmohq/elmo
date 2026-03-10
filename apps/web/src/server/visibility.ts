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
import { generateDateRange, getDaysFromLookback, type LookbackPeriod } from "@/lib/chart-utils";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";
import {
	getBatchChartData,
	getBatchVisibilityData,
	getVisibilityTimeSeries,
	getDailyCitationStats,
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
			modelGroup: z.string().optional(),
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
				data.modelGroup,
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
			modelGroup: z.string().optional(),
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
		const { fromDateStr, toDateStr } = getTimezoneLookbackRange(lookbackParam, timezone);

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

		const brandName = brandResult[0]?.name || "";
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

		const [visibilityData, citationData] = await Promise.all([
			getVisibilityTimeSeries(
				data.brandId,
				fromDateStr,
				toDateStr,
				timezone,
				brandedPromptIds,
				data.promptIds,
				data.modelGroup,
			),
			fromDateStr && toDateStr
				? getDailyCitationStats(data.brandId, fromDateStr, toDateStr, timezone, data.promptIds, data.modelGroup)
				: Promise.resolve([]),
		]);

		const totalCitations = citationData.reduce((sum, row) => sum + Number(row.count), 0);

		// Process visibility data
		const dailyVisibilityMap = new Map<
			string,
			{
				branded: { total: number; mentioned: number };
				nonBranded: { total: number; mentioned: number };
			}
		>();

		let totalBrandedRuns = 0;
		let totalBrandedMentioned = 0;
		let totalNonBrandedRuns = 0;
		let totalNonBrandedMentioned = 0;

		for (const row of visibilityData) {
			const dateStr = String(row.date);
			if (!dailyVisibilityMap.has(dateStr)) {
				dailyVisibilityMap.set(dateStr, {
					branded: { total: 0, mentioned: 0 },
					nonBranded: { total: 0, mentioned: 0 },
				});
			}
			const dayData = dailyVisibilityMap.get(dateStr)!;
			const runs = Number(row.total_runs);
			const mentioned = Number(row.brand_mentioned_count);

			if (row.is_branded) {
				dayData.branded.total += runs;
				dayData.branded.mentioned += mentioned;
				totalBrandedRuns += runs;
				totalBrandedMentioned += mentioned;
			} else {
				dayData.nonBranded.total += runs;
				dayData.nonBranded.mentioned += mentioned;
				totalNonBrandedRuns += runs;
				totalNonBrandedMentioned += mentioned;
			}
		}

		const totalRuns = totalBrandedRuns + totalNonBrandedRuns;
		const totalMentioned = totalBrandedMentioned + totalNonBrandedMentioned;
		const currentVisibility = totalRuns > 0 ? Math.round((totalMentioned / totalRuns) * 100) : 0;

		// Generate date range
		let startDate: Date;
		let endDate: Date;

		const sortedDates = Array.from(dailyVisibilityMap.keys()).sort();
		if (lookbackParam === "all" && sortedDates.length > 0) {
			startDate = new Date(sortedDates[0]);
			endDate = new Date(sortedDates[sortedDates.length - 1]);
		} else {
			const daysToSubtract = getDaysFromLookback(lookbackParam);
			const currentDateInTimezone = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
			endDate = new Date(currentDateInTimezone);
			startDate = new Date(endDate);
			startDate.setDate(startDate.getDate() - (daysToSubtract - 1));
		}

		const dateRange = generateDateRange(startDate, endDate);

		// 7-day rolling average
		const ROLLING_WINDOW_DAYS = 7;
		const visibilityTimeSeries: VisibilityTimeSeriesPoint[] = dateRange.map((date, dateIndex) => {
			let windowBrandedTotal = 0;
			let windowBrandedMentioned = 0;
			let windowNonBrandedTotal = 0;
			let windowNonBrandedMentioned = 0;

			for (let i = 0; i < ROLLING_WINDOW_DAYS; i++) {
				const lookbackIndex = dateIndex - i;
				if (lookbackIndex >= 0) {
					const lookbackDate = dateRange[lookbackIndex];
					const dayData = dailyVisibilityMap.get(lookbackDate);
					if (dayData) {
						windowBrandedTotal += dayData.branded.total;
						windowBrandedMentioned += dayData.branded.mentioned;
						windowNonBrandedTotal += dayData.nonBranded.total;
						windowNonBrandedMentioned += dayData.nonBranded.mentioned;
					}
				}
			}

			const totalWindowRuns = windowBrandedTotal + windowNonBrandedTotal;
			const totalWindowMentioned = windowBrandedMentioned + windowNonBrandedMentioned;

			if (totalWindowRuns === 0) {
				return { date, visibility: null };
			}

			return { date, visibility: Math.round((totalWindowMentioned / totalWindowRuns) * 100) };
		});

		return {
			currentVisibility,
			totalRuns,
			totalPrompts,
			totalCitations,
			visibilityTimeSeries,
			lookback: lookbackParam,
		};
	});
