import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, promptRuns, competitors, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { getDaysFromLookback, generateDateRange } from "@/lib/chart-utils";
import type { LookbackPeriod } from "@/lib/chart-utils";
import type { Brand, Competitor } from "@/lib/db/schema";

type Params = {
	id: string;
	promptId: string;
};

export interface PromptChartDataAggregatedResponse {
	prompt: {
		id: string;
		value: string;
		groupCategory: string | null;
		groupPrefix: string | null;
	};
	chartData: Array<{
		date: string;
		[key: string]: number | string | null; // Dynamic keys for brand/competitor IDs
	}>;
	brand: Brand;
	competitors: Competitor[];
	totalRuns: number;
	hasVisibilityData: boolean;
	lastBrandVisibility: number | null;
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

		// Fetch the full brand data
		const brandData = await db
			.select()
			.from(brands)
			.where(eq(brands.id, brandId))
			.limit(1);

		if (brandData.length === 0) {
			return NextResponse.json({ error: "Brand not found" }, { status: 404 });
		}

		const brand = brandData[0];

		// Parse query parameters
		const lookbackParam = (searchParams.get("lookback") || "1w") as LookbackPeriod;
		const webSearchEnabledParam = searchParams.get("webSearchEnabled");
		const modelGroupParam = searchParams.get("modelGroup");

		let fromDate: Date | undefined;
		let toDate: Date | undefined;

		// Handle lookback periods
		if (lookbackParam && lookbackParam !== "all") {
			toDate = new Date();
			fromDate = new Date();

			switch (lookbackParam) {
				case "1w":
					fromDate.setDate(fromDate.getDate() - 7);
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
				default:
					return NextResponse.json(
						{ error: "Invalid lookback period. Use: 1w, 1m, 3m, 6m, 1y, or all" },
						{ status: 400 },
					);
			}
		}

		// Verify prompt exists and belongs to this brand
		const prompt = await db
			.select({
				id: prompts.id,
				value: prompts.value,
				groupCategory: prompts.groupCategory,
				groupPrefix: prompts.groupPrefix,
				brandId: prompts.brandId,
			})
			.from(prompts)
			.where(eq(prompts.id, promptId))
			.limit(1);

		if (prompt.length === 0) {
			return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
		}

		if (prompt[0].brandId !== brandId) {
			return NextResponse.json({ error: "Access denied to this prompt" }, { status: 403 });
		}

		// Build query conditions for prompt runs
		const runConditions = [eq(promptRuns.promptId, promptId)];

		// Add time range conditions if specified
		if (fromDate) {
			runConditions.push(gte(promptRuns.createdAt, fromDate));
		}
		if (toDate) {
			runConditions.push(lte(promptRuns.createdAt, toDate));
		}

		// Add webSearchEnabled filter if specified
		if (webSearchEnabledParam !== null) {
			const webSearchEnabled = webSearchEnabledParam === "true";
			runConditions.push(eq(promptRuns.webSearchEnabled, webSearchEnabled));
		}

		// Add modelGroup filter if specified
		if (modelGroupParam) {
			const validModelGroups = ["openai", "anthropic", "google"];
			if (!validModelGroups.includes(modelGroupParam)) {
				return NextResponse.json({ error: "Invalid model group. Use: openai, anthropic, or google" }, { status: 400 });
			}
			runConditions.push(eq(promptRuns.modelGroup, modelGroupParam as "openai" | "anthropic" | "google"));
		}

		// Fetch competitors for this brand
		const brandCompetitors = await db
			.select()
			.from(competitors)
			.where(eq(competitors.brandId, brandId));

		// Calculate date range for the lookback period
		let startDate: Date;
		let endDate: Date;

		if (lookbackParam === "all") {
			// For "all", we need to find the actual data range
			const firstRunResult = await db
				.select({ createdAt: promptRuns.createdAt })
				.from(promptRuns)
				.where(and(...runConditions))
				.orderBy(promptRuns.createdAt)
				.limit(1);

			const lastRunResult = await db
				.select({ createdAt: promptRuns.createdAt })
				.from(promptRuns)
				.where(and(...runConditions))
				.orderBy(desc(promptRuns.createdAt))
				.limit(1);

			if (firstRunResult.length === 0 || lastRunResult.length === 0) {
				// No runs found
				startDate = new Date();
				endDate = new Date();
			} else {
				startDate = new Date(firstRunResult[0].createdAt.toDateString());
				endDate = new Date(lastRunResult[0].createdAt.toDateString());
			}
		} else {
			// Use timezone-aware date range
			const daysToSubtract = getDaysFromLookback(lookbackParam);
			const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			const now = new Date();
			const currentDateInTimezone = now.toLocaleDateString("en-CA", { timeZone: userTimezone });
			endDate = new Date(currentDateInTimezone);
			startDate = new Date(endDate);
			startDate.setDate(startDate.getDate() - (daysToSubtract - 1));
		}

		// Generate complete date range
		const dateRange = generateDateRange(startDate, endDate);

		// Aggregate data by date at the database level
		const aggregatedData = await db
			.select({
				date: sql<string>`DATE(${promptRuns.createdAt})`,
				totalRuns: sql<number>`COUNT(*)`,
				brandMentions: sql<number>`SUM(CASE WHEN ${promptRuns.brandMentioned} THEN 1 ELSE 0 END)`,
				// We'll handle competitor mentions in a separate query since it's more complex
			})
			.from(promptRuns)
			.where(and(...runConditions))
			.groupBy(sql`DATE(${promptRuns.createdAt})`)
			.orderBy(sql`DATE(${promptRuns.createdAt})`);

		// For competitor mentions, we need a more complex query
		const competitorMentionsData = await db
			.select({
				date: sql<string>`DATE(${promptRuns.createdAt})`,
				competitorsMentioned: promptRuns.competitorsMentioned,
			})
			.from(promptRuns)
			.where(and(...runConditions));

		// Process competitor mentions by date
		const competitorMentionsByDate: Record<string, Record<string, number>> = {};
		for (const row of competitorMentionsData) {
			const date = row.date;
			if (!competitorMentionsByDate[date]) {
				competitorMentionsByDate[date] = {};
			}
			
			if (row.competitorsMentioned) {
				for (const competitorName of row.competitorsMentioned) {
					const competitor = brandCompetitors.find(c => c.name === competitorName);
					if (competitor) {
						if (!competitorMentionsByDate[date][competitor.id]) {
							competitorMentionsByDate[date][competitor.id] = 0;
						}
						competitorMentionsByDate[date][competitor.id]++;
					}
				}
			}
		}

		// Convert aggregated data to chart format
		const aggregatedByDate = aggregatedData.reduce((acc, row) => {
			acc[row.date] = {
				totalRuns: Number(row.totalRuns),
				brandMentions: Number(row.brandMentions),
			};
			return acc;
		}, {} as Record<string, { totalRuns: number; brandMentions: number }>);

		// Build chart data
		const chartData = dateRange.map((date) => {
			const dayData = aggregatedByDate[date];
			const dataPoint: { date: string; [key: string]: number | string | null } = { date };

			if (!dayData || dayData.totalRuns === 0) {
				// Set null values for brand and all competitors
				dataPoint[brand.id] = null;
				brandCompetitors.forEach((competitor) => {
					dataPoint[competitor.id] = null;
				});
				return dataPoint;
			}

			// Calculate brand visibility percentage
			const brandVisibility = Math.round((dayData.brandMentions / dayData.totalRuns) * 100);
			dataPoint[brand.id] = brandVisibility;

			// Calculate competitor visibility percentages
			const competitorMentions = competitorMentionsByDate[date] || {};
			brandCompetitors.forEach((competitor) => {
				const mentions = competitorMentions[competitor.id] || 0;
				const competitorVisibility = Math.round((mentions / dayData.totalRuns) * 100);
				dataPoint[competitor.id] = competitorVisibility;
			});

			return dataPoint;
		});

		// Calculate total runs and visibility data
		const totalRuns = Object.values(aggregatedByDate).reduce((sum, day) => sum + day.totalRuns, 0);

		// Check if there's any non-zero visibility data
		const hasVisibilityData = chartData.some((dataPoint) => {
			const allBrandIds = [brand.id, ...brandCompetitors.map((c) => c.id)];
			return allBrandIds.some((id) => {
				const visibility = dataPoint[id];
				return visibility !== null && visibility !== undefined && Number(visibility) > 0;
			});
		});

		// Get the last visibility value for the brand
		const lastDataPoint = chartData.filter((point) => point[brand.id] !== null).pop();
		const lastBrandVisibility = lastDataPoint ? (lastDataPoint[brand.id] as number) : null;

		const response: PromptChartDataAggregatedResponse = {
			prompt: {
				id: prompt[0].id,
				value: prompt[0].value,
				groupCategory: prompt[0].groupCategory,
				groupPrefix: prompt[0].groupPrefix,
			},
			chartData,
			brand,
			competitors: brandCompetitors,
			totalRuns,
			hasVisibilityData,
			lastBrandVisibility,
		};

		return NextResponse.json(response);
	} catch (error) {
		console.error("Error fetching aggregated prompt chart data:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
