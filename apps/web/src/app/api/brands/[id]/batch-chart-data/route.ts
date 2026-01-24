import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, inArray, and } from "drizzle-orm";
import type { LookbackPeriod } from "@/lib/chart-utils";
import { 
	getBatchChartData,
	getBatchVisibilityData,
	type ProcessedBatchChartDataPoint,
} from "@/lib/tinybird-read-v2";

type Params = {
	id: string;
};

export interface BatchChartDataResponse {
	// Raw chart data points (prompt_id, date, counts)
	chartData: ProcessedBatchChartDataPoint[];
	// Visibility data for the header bar
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
	// Metadata for rendering
	brand: {
		id: string;
		name: string;
	};
	competitors: Array<{
		id: string;
		name: string;
	}>;
	// Date range info
	dateRange: {
		fromDate: string;
		toDate: string;
	};
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
		const modelGroupParam = searchParams.get("modelGroup");
		const promptIdsParam = searchParams.get("promptIds"); // comma-separated
		
		// Use client timezone for chart grouping
		const timezone = searchParams.get("timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone;

		// Calculate date range
		let fromDateStr: string | null = null;
		let toDateStr: string | null = null;

		const now = new Date();
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
		} else {
			// For "all", set reasonable defaults
			toDateStr = todayStr;
			const fromDate = new Date(now);
			fromDate.setFullYear(fromDate.getFullYear() - 1);
			fromDateStr = fromDate.toLocaleDateString("en-CA", { timeZone: timezone });
		}

		// Parse prompt IDs
		const promptIds = promptIdsParam 
			? promptIdsParam.split(",").map(id => id.trim()).filter(Boolean)
			: [];

		if (promptIds.length === 0) {
			return NextResponse.json({ 
				error: "promptIds parameter is required" 
			}, { status: 400 });
		}

		// Get brand and competitors from PostgreSQL
		const [brandResult, competitorsResult, promptsResult] = await Promise.all([
			db.select({
				id: brands.id,
				name: brands.name,
			}).from(brands).where(eq(brands.id, brandId)).limit(1),
			
			db.select({
				id: competitors.id,
				name: competitors.name,
			}).from(competitors).where(eq(competitors.brandId, brandId)),

			// Get prompt values to determine branded vs non-branded
			db.select({
				id: prompts.id,
				value: prompts.value,
			}).from(prompts).where(
				and(
					eq(prompts.brandId, brandId),
					inArray(prompts.id, promptIds)
				)
			),
		]);

		if (brandResult.length === 0) {
			return NextResponse.json({ error: "Brand not found" }, { status: 404 });
		}

		const brand = brandResult[0];
		
		// Determine branded prompt IDs (prompts that contain the brand name)
		const brandedPromptIds = promptsResult
			.filter((p) => p.value.toLowerCase().includes(brand.name.toLowerCase()))
			.map((p) => p.id);

		// Fetch batch chart data and visibility data in parallel
		const [chartData, visibilityData] = await Promise.all([
			getBatchChartData(
				brandId,
				promptIds,
				fromDateStr,
				toDateStr,
				timezone,
				undefined, // webSearchEnabled
				modelGroupParam || undefined,
			),
			getBatchVisibilityData(
				brandId,
				promptIds,
				brandedPromptIds,
				fromDateStr,
				toDateStr,
				timezone,
			),
		]);

		// Calculate current visibility percentage
		const currentVisibility = visibilityData.totalRuns > 0
			? Math.round((visibilityData.totalMentioned / visibilityData.totalRuns) * 100)
			: 0;

		const response: BatchChartDataResponse = {
			chartData,
			visibility: {
				currentVisibility,
				totalRuns: visibilityData.totalRuns,
				visibilityTimeSeries: visibilityData.visibilityTimeSeries,
			},
			brand: {
				id: brand.id,
				name: brand.name,
			},
			competitors: competitorsResult,
			dateRange: {
				fromDate: fromDateStr!,
				toDate: toDateStr!,
			},
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching batch chart data:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
