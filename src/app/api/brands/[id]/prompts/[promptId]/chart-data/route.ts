import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, competitors, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq } from "drizzle-orm";
import { generateDateRange, getDaysFromLookback } from "@/lib/chart-utils";
import type { LookbackPeriod } from "@/lib/chart-utils";
import type { Brand, Competitor } from "@/lib/db/schema";
import { 
	getTinybirdPromptDailyStats, 
	getTinybirdPromptCompetitorDailyStats,
	getTinybirdPromptWebQueriesForMapping,
} from "@/lib/tinybird-read";

type Params = {
	id: string;
	promptId: string;
};

export interface PromptChartDataResponse {
	prompt: {
		id: string;
		value: string;
		groupCategory: string | null;
		groupPrefix: string | null;
	};
	chartData: Array<{
		date: string;
		[key: string]: number | string | null;
	}>;
	brand: Brand;
	competitors: Competitor[];
	totalRuns: number;
	hasVisibilityData: boolean;
	lastBrandVisibility: number | null;
	// Web query mappings for optimize button
	webQueryMapping: Record<string, string>;
	modelWebQueryMappings: Record<string, Record<string, string>>;
}

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId, promptId } = await params;
		const { searchParams } = new URL(request.url);

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((b) => b.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Parse query parameters
		const lookbackParam = (searchParams.get("lookback") || "1w") as LookbackPeriod;
		const webSearchEnabledParam = searchParams.get("webSearchEnabled");
		const modelGroupParam = searchParams.get("modelGroup");
		
		// Use client timezone for chart grouping - this matches the original behavior
		// where calculateVisibilityPercentages used userTimezone to bucket events by local date
		const timezone = searchParams.get("timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone;

		// Calculate date range in user's timezone
		let fromDateStr: string | null = null;
		let toDateStr: string | null = null;
		let startDate: Date;
		let endDate: Date;

		const now = new Date();
		// Get today's date in the user's timezone - always needed for endDate
		const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });

		if (lookbackParam && lookbackParam !== "all") {
			toDateStr = todayStr;
			
			const fromDate = new Date(now);
			switch (lookbackParam) {
				case "1w":
					fromDate.setDate(fromDate.getDate() - 6); // 7 days including today
					break;
				case "1m":
					fromDate.setMonth(fromDate.getMonth() - 1);
					break;
				case "3m":
					fromDate.setMonth(fromDate.getMonth() - 3);
					break;
				case "6m":
					fromDate.setMonth(fromDate.getMonth() - 6);
					break;
				case "1y":
					fromDate.setFullYear(fromDate.getFullYear() - 1);
					break;
			}
			fromDateStr = fromDate.toLocaleDateString("en-CA", { timeZone: timezone });
			
			startDate = new Date(fromDateStr);
			endDate = new Date(toDateStr);
		} else {
			// For "all", set toDate to today but leave fromDate null
			// This ensures we include data up to today
			toDateStr = todayStr;
			// We'll determine startDate from the data, endDate is today
			startDate = new Date();
			endDate = new Date(todayStr);
		}

		// Validate modelGroup if specified
		if (modelGroupParam) {
			const validModelGroups = ["openai", "anthropic", "google"];
			if (!validModelGroups.includes(modelGroupParam)) {
				return NextResponse.json({ error: "Invalid model group" }, { status: 400 });
			}
		}

		// Get prompt, brand, and competitors from PostgreSQL (metadata only)
		const [promptData, brandData, competitorsData] = await Promise.all([
			db.select({
				id: prompts.id,
				value: prompts.value,
				groupCategory: prompts.groupCategory,
				groupPrefix: prompts.groupPrefix,
				brandId: prompts.brandId,
			}).from(prompts).where(eq(prompts.id, promptId)).limit(1),

			db.select().from(brands).where(eq(brands.id, brandId)).limit(1),

			db.select().from(competitors).where(eq(competitors.brandId, brandId))
		]);

		if (promptData.length === 0) {
			return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
		}

		if (brandData.length === 0) {
			return NextResponse.json({ error: "Brand not found" }, { status: 404 });
		}

		if (promptData[0].brandId !== brandId) {
			return NextResponse.json({ error: "Access denied" }, { status: 403 });
		}

		const prompt = promptData[0];
		const brand = brandData[0];
		const brandCompetitors = competitorsData;

		// Parse webSearchEnabled filter
		const webSearchEnabled = webSearchEnabledParam !== null ? webSearchEnabledParam === "true" : undefined;

		// Get stats from Tinybird
		const [dailyStats, competitorStats, webQueryData] = await Promise.all([
			getTinybirdPromptDailyStats(
				promptId,
				fromDateStr,
				toDateStr,
				timezone,
				webSearchEnabled,
				modelGroupParam || undefined,
			),
			getTinybirdPromptCompetitorDailyStats(
				promptId,
				fromDateStr,
				toDateStr,
				timezone,
				webSearchEnabled,
				modelGroupParam || undefined,
			),
			getTinybirdPromptWebQueriesForMapping(
				promptId,
				fromDateStr,
				toDateStr,
				timezone,
			),
		]);

		// For "all" lookback, determine startDate from data (endDate is already today)
		if (lookbackParam === "all" && dailyStats.length > 0) {
			const sortedDates = dailyStats.map(s => String(s.date)).sort();
			startDate = new Date(sortedDates[0]);
			// endDate stays as today (already set above)
		}

		// Generate date range
		const dateRange = generateDateRange(startDate, endDate);

		// Create maps for quick lookup
		const dailyStatsMap = new Map<string, { total_runs: number; brand_mentioned_count: number }>();
		for (const stat of dailyStats) {
			dailyStatsMap.set(String(stat.date), {
				total_runs: Number(stat.total_runs),
				brand_mentioned_count: Number(stat.brand_mentioned_count),
			});
		}

		// Create competitor stats map: date -> competitor_name -> count
		const competitorStatsMap = new Map<string, Map<string, number>>();
		for (const stat of competitorStats) {
			const dateStr = String(stat.date);
			if (!competitorStatsMap.has(dateStr)) {
				competitorStatsMap.set(dateStr, new Map());
			}
			competitorStatsMap.get(dateStr)!.set(stat.competitor_name, Number(stat.mention_count));
		}

		// Sort competitors alphabetically for consistent color assignment
		const sortedCompetitors = [...brandCompetitors].sort((a, b) => a.name.localeCompare(b.name));

		// Build chart data
		const chartData: Array<{ date: string; [key: string]: number | string | null }> = dateRange.map((date) => {
			const dayStat = dailyStatsMap.get(date);
			const totalRuns = dayStat?.total_runs || 0;

			const dataPoint: { date: string; [key: string]: number | string | null } = { date };

			if (totalRuns === 0) {
				// No data for this date
				dataPoint[brand.id] = null;
				sortedCompetitors.forEach((competitor) => {
					dataPoint[competitor.id] = null;
				});
				return dataPoint;
			}

			// Calculate brand visibility percentage
			const brandMentions = dayStat?.brand_mentioned_count || 0;
			const brandVisibility = Math.round((brandMentions / totalRuns) * 100);
			dataPoint[brand.id] = brandVisibility;

			// Calculate competitor visibility percentages
			const competitorCountsForDate = competitorStatsMap.get(date) || new Map();
			sortedCompetitors.forEach((competitor) => {
				const competitorMentions = competitorCountsForDate.get(competitor.name) || 0;
				const competitorVisibility = Math.round((competitorMentions / totalRuns) * 100);
				dataPoint[competitor.id] = competitorVisibility;
			});

			return dataPoint;
		});

		// Calculate totals and metadata
		const totalRuns = dailyStats.reduce((sum, s) => sum + Number(s.total_runs), 0);
		
		const hasVisibilityData = chartData.some(dataPoint => {
			const allIds = [brand.id, ...sortedCompetitors.map(c => c.id)];
			return allIds.some(id => {
				const visibility = dataPoint[id];
				return visibility !== null && visibility !== undefined && Number(visibility) > 0;
			});
		});

		const lastDataPoint = chartData.filter(point => point[brand.id] !== null).pop();
		const lastBrandVisibility = lastDataPoint ? (lastDataPoint[brand.id] as number) : null;

		// Generate web query mappings for optimize button
		const webQueryMapping: Record<string, string> = {};
		const modelWebQueryMappings: Record<string, Record<string, string>> = {};

		if (webQueryData.length > 0) {
			// Data is already ordered by created_at ASC, so first entry is oldest
			// Find oldest web query overall
			const oldestQuery = webQueryData[0];
			if (oldestQuery) {
				// Get all queries from the same timestamp
				const oldestTime = new Date(oldestQuery.created_at_iso).getTime();
				const oldestQueries = webQueryData
					.filter(q => new Date(q.created_at_iso).getTime() === oldestTime)
					.map(q => q.web_query)
					.sort();
				
				if (oldestQueries.length > 0) {
					webQueryMapping[promptId] = oldestQueries[0];
				}
			}

			// Find oldest web query per model group
			const modelGroups = ['openai', 'anthropic', 'google'];
			modelGroups.forEach(modelGroup => {
				const modelQueries = webQueryData.filter(q => q.model_group === modelGroup);
				if (modelQueries.length > 0) {
					const oldestModelQuery = modelQueries[0];
					const oldestModelTime = new Date(oldestModelQuery.created_at_iso).getTime();
					const oldestModelQueries = modelQueries
						.filter(q => new Date(q.created_at_iso).getTime() === oldestModelTime)
						.map(q => q.web_query)
						.sort();
					
					if (oldestModelQueries.length > 0) {
						if (!modelWebQueryMappings[modelGroup]) {
							modelWebQueryMappings[modelGroup] = {};
						}
						modelWebQueryMappings[modelGroup][promptId] = oldestModelQueries[0];
					}
				}
			});
		}

		const response: PromptChartDataResponse = {
			prompt: {
				id: prompt.id,
				value: prompt.value,
				groupCategory: prompt.groupCategory,
				groupPrefix: prompt.groupPrefix,
			},
			chartData,
			brand,
			competitors: brandCompetitors,
			totalRuns,
			hasVisibilityData,
			lastBrandVisibility,
			webQueryMapping,
			modelWebQueryMappings,
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching prompt chart data:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
