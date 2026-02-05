import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/lib/db/db";
import { prompts, brands } from "@workspace/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, inArray } from "drizzle-orm";
import { generateDateRange, getDaysFromLookback, type LookbackPeriod } from "@/lib/chart-utils";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";
import { 
	getVisibilityTimeSeries,
	getDailyCitationStats,
} from "@/lib/tinybird-read-v2";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";

type Params = {
	id: string;
};

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

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;
		const { searchParams } = new URL(request.url);

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Parse query parameters
		// Default to "1m" to match frontend default (getDefaultLookbackPeriod)
		const lookbackParam = (searchParams.get("lookback") || "1m") as LookbackPeriod;
		const promptIdsParam = searchParams.get("promptIds");
		const modelGroupParam = searchParams.get("modelGroup");

		// Use client timezone for consistent date filtering with batch-chart-data
		const timezone = resolveTimezone(searchParams.get("timezone"));

		let fromDate: Date | undefined;
		let toDate: Date | undefined;
		let fromDateStr: string | null = null;
		let toDateStr: string | null = null;

		// Handle lookback periods - use same logic as batch-chart-data for consistency
		({ fromDateStr, toDateStr } = getTimezoneLookbackRange(lookbackParam, timezone));
		if (fromDateStr) fromDate = new Date(`${fromDateStr}T00:00:00Z`);
		if (toDateStr) toDate = new Date(`${toDateStr}T00:00:00Z`);

		// Parse prompt IDs from parameter
		const promptIds = promptIdsParam 
			? promptIdsParam.split(",").map(id => id.trim()).filter(Boolean)
			: [];

		// If no prompt IDs provided, return empty data
		if (promptIds.length === 0) {
			return NextResponse.json({
				currentVisibility: 0,
				totalRuns: 0,
				totalPrompts: 0,
				totalCitations: 0,
				visibilityTimeSeries: [],
				lookback: lookbackParam,
			} as FilteredVisibilityResponse);
		}

		// Get brand name and prompt values for determining branded/non-branded
		const [brandResult, promptsResult] = await Promise.all([
			db
				.select({ name: brands.name })
				.from(brands)
				.where(eq(brands.id, brandId))
				.limit(1),
			db
				.select({ 
					id: prompts.id, 
					value: prompts.value,
					systemTags: prompts.systemTags,
					tags: prompts.tags,
				})
				.from(prompts)
				.where(and(eq(prompts.brandId, brandId), inArray(prompts.id, promptIds))),
		]);

		const brandName = brandResult[0]?.name || "";
		const totalPrompts = promptsResult.length;

		// If no prompts found, return empty data
		if (totalPrompts === 0) {
			return NextResponse.json({
				currentVisibility: 0,
				totalRuns: 0,
				totalPrompts: 0,
				totalCitations: 0,
				visibilityTimeSeries: [],
				lookback: lookbackParam,
			} as FilteredVisibilityResponse);
		}

		// Determine which prompts are "branded"
		// Use effective status which considers user tag overrides
		const brandedPromptIds = promptsResult
			.filter((p) => {
				const effectiveStatus = getEffectiveBrandedStatus(
					p.systemTags || [],
					p.tags || []
				);
				return effectiveStatus.isBranded;
			})
			.map((p) => p.id);

		// Query Tinybird for visibility data and citation counts in parallel
		const [visibilityData, citationData] = await Promise.all([
			getVisibilityTimeSeries(
				brandId,
				fromDateStr,
				toDateStr,
				timezone,
				brandedPromptIds,
				promptIds,
				modelGroupParam || undefined,
			),
			fromDateStr && toDateStr
				? getDailyCitationStats(
						brandId,
						fromDateStr,
						toDateStr,
						timezone,
						promptIds,
						modelGroupParam || undefined,
				  )
				: Promise.resolve([]),
		]);

		// Calculate total citations
		const totalCitations = citationData.reduce((sum, row) => sum + Number(row.count), 0);

		// Process visibility data - matching dashboard logic
		const dailyVisibilityMap = new Map<string, {
			branded: { total: number; mentioned: number };
			nonBranded: { total: number; mentioned: number };
		}>();

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

		// Calculate overall visibility (matching dashboard - total mentions / total runs)
		const totalRuns = totalBrandedRuns + totalNonBrandedRuns;
		const totalMentioned = totalBrandedMentioned + totalNonBrandedMentioned;
		const currentVisibility = totalRuns > 0
			? Math.round((totalMentioned / totalRuns) * 100)
			: 0;

		// Generate date range for time series
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

		// Calculate visibility time series with 7-day rolling average (matching dashboard)
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

			const visibility = Math.round((totalWindowMentioned / totalWindowRuns) * 100);
			return { date, visibility };
		});

		const response: FilteredVisibilityResponse = {
			currentVisibility,
			totalRuns,
			totalPrompts,
			totalCitations,
			visibilityTimeSeries,
			lookback: lookbackParam,
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching filtered visibility:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
