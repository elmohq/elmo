import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, promptRuns, competitors, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { generateDateRange, getDaysFromLookback, calculateVisibilityPercentages } from "@/lib/chart-utils";
import type { LookbackPeriod } from "@/lib/chart-utils";
import type { Brand, Competitor } from "@/lib/db/schema";

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
		// Use client timezone if provided, otherwise fall back to server default
		const timezoneParam = searchParams.get("timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone;

		// Calculate date range for SQL query with buffer days to handle timezone differences
		// The precise timezone-aware date bucketing happens in calculateVisibilityPercentages
		let fromDate: Date | undefined;
		let toDate: Date | undefined;

		if (lookbackParam && lookbackParam !== "all") {
			const now = new Date();
			
			// End date: add 1 day buffer to ensure we include all of "today" in any timezone
			toDate = new Date(now);
			toDate.setDate(toDate.getDate() + 1);
			
			// Start date: add 1 day buffer before the lookback period
			fromDate = new Date(now);
			switch (lookbackParam) {
				case "1w":
					fromDate.setDate(fromDate.getDate() - 8); // 7 days + 1 day buffer
					break;
				case "1m":
					fromDate.setMonth(fromDate.getMonth() - 1);
					fromDate.setDate(fromDate.getDate() - 1); // 1 day buffer
					break;
				case "3m":
					fromDate.setMonth(fromDate.getMonth() - 3);
					fromDate.setDate(fromDate.getDate() - 1);
					break;
				case "6m":
					fromDate.setMonth(fromDate.getMonth() - 6);
					fromDate.setDate(fromDate.getDate() - 1);
					break;
				case "1y":
					fromDate.setFullYear(fromDate.getFullYear() - 1);
					fromDate.setDate(fromDate.getDate() - 1);
					break;
			}
		}

		// Build query conditions
		const runConditions = [eq(promptRuns.promptId, promptId)];

		if (fromDate) runConditions.push(gte(promptRuns.createdAt, fromDate));
		if (toDate) runConditions.push(lte(promptRuns.createdAt, toDate));

		if (webSearchEnabledParam !== null) {
			const webSearchEnabled = webSearchEnabledParam === "true";
			runConditions.push(eq(promptRuns.webSearchEnabled, webSearchEnabled));
		}

		if (modelGroupParam) {
			const validModelGroups = ["openai", "anthropic", "google"];
			if (!validModelGroups.includes(modelGroupParam)) {
				return NextResponse.json({ error: "Invalid model group" }, { status: 400 });
			}
			runConditions.push(eq(promptRuns.modelGroup, modelGroupParam as "openai" | "anthropic" | "google"));
		}

		// OPTIMIZATION 1: Parallel queries instead of sequential
		const [promptData, brandData, competitorsData] = await Promise.all([
			// Get prompt info
			db.select({
				id: prompts.id,
				value: prompts.value,
				groupCategory: prompts.groupCategory,
				groupPrefix: prompts.groupPrefix,
				brandId: prompts.brandId,
			}).from(prompts).where(eq(prompts.id, promptId)).limit(1),

			// Get brand info
			db.select().from(brands).where(eq(brands.id, brandId)).limit(1),

			// Get competitors
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

		// OPTIMIZATION 2: Simplified approach - fetch minimal data efficiently
		const runs = await db
			.select({
				id: promptRuns.id,
				promptId: promptRuns.promptId,
				modelGroup: promptRuns.modelGroup,
				model: promptRuns.model,
				webSearchEnabled: promptRuns.webSearchEnabled,
				rawOutput: sql<unknown>`NULL`, // Don't fetch the large rawOutput field
				webQueries: promptRuns.webQueries,
				brandMentioned: promptRuns.brandMentioned,
				competitorsMentioned: promptRuns.competitorsMentioned,
				createdAt: promptRuns.createdAt,
			})
			.from(promptRuns)
			.where(and(...runConditions))
			.orderBy(desc(promptRuns.createdAt));

		// OPTIMIZATION 3: Use existing chart calculation but with minimal data
		// Pass client timezone to ensure server and client agree on what "today" is
		const chartData = calculateVisibilityPercentages(runs, brand, brandCompetitors, lookbackParam, timezoneParam);

		// Calculate metadata
		const totalRuns = runs.length;
		
		const hasVisibilityData = chartData.some(dataPoint => {
			const allBrandIds = [brand.id, ...brandCompetitors.map(c => c.id)];
			return allBrandIds.some(id => {
				const visibility = dataPoint[id];
				return visibility !== null && visibility !== undefined && Number(visibility) > 0;
			});
		});

		const lastDataPoint = chartData.filter(point => point[brand.id] !== null).pop();
		const lastBrandVisibility = lastDataPoint ? (lastDataPoint[brand.id] as number) : null;

		// Generate web query mappings for optimize button (following chart-utils logic)
		const webQueryMapping: Record<string, string> = {};
		const modelWebQueryMappings: Record<string, Record<string, string>> = {};

		// Filter runs that have web queries
		const runsWithWebQueries = runs.filter((run: any) => run.webQueries && run.webQueries.length > 0);

		if (runsWithWebQueries.length > 0) {
			// Overall mapping - find oldest web query (first alphabetically if tie)
			// Sort by creation date (oldest first)
			runsWithWebQueries.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
			
			// Get oldest date
			const oldestDate = runsWithWebQueries[0].createdAt;
			const oldestRuns = runsWithWebQueries.filter(
				(run: any) => new Date(run.createdAt).getTime() === new Date(oldestDate).getTime()
			);

			// Get all web queries from the oldest runs and find first alphabetically
			const allWebQueries: string[] = [];
			oldestRuns.forEach((run: any) => {
				if (run.webQueries) {
					allWebQueries.push(...run.webQueries);
				}
			});

			if (allWebQueries.length > 0) {
				// Sort alphabetically and take the first
				allWebQueries.sort();
				webQueryMapping[promptId] = allWebQueries[0];
			}

			// Model-specific mappings - same logic per model
			['openai', 'anthropic', 'google'].forEach(modelGroup => {
				const modelRuns = runsWithWebQueries.filter((run: any) => run.modelGroup === modelGroup);
				if (modelRuns.length > 0) {
					// Sort by creation date (oldest first) for this model
					modelRuns.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
					
					// Get oldest date for this model
					const oldestModelDate = modelRuns[0].createdAt;
					const oldestModelRuns = modelRuns.filter(
						(run: any) => new Date(run.createdAt).getTime() === new Date(oldestModelDate).getTime()
					);

					// Get all web queries from the oldest runs for this model
					const modelWebQueries: string[] = [];
					oldestModelRuns.forEach((run: any) => {
						if (run.webQueries) {
							modelWebQueries.push(...run.webQueries);
						}
					});

					if (modelWebQueries.length > 0) {
						// Sort alphabetically and take the first
						modelWebQueries.sort();
						if (!modelWebQueryMappings[modelGroup]) {
							modelWebQueryMappings[modelGroup] = {};
						}
						modelWebQueryMappings[modelGroup][promptId] = modelWebQueries[0];
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
		console.error("Error fetching fast prompt chart data:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
