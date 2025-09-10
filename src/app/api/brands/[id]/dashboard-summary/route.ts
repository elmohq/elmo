import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, promptRuns, competitors, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, gte, lte, sql, count } from "drizzle-orm";

type Params = {
	id: string;
};

export interface DashboardSummaryResponse {
	totalPrompts: number;
	totalRuns: number;
	averageVisibility: number;
	recentActivity: {
		date: string;
		runs: number;
	}[];
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

		// Parse lookback parameter
		const lookbackParam = searchParams.get("lookback") || "1m";
		
		let fromDate: Date | undefined;
		let toDate: Date | undefined;

		// Handle lookback periods
		if (lookbackParam !== "all") {
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
			}
		}

		// Build query conditions
		const runConditions = [];
		if (fromDate) runConditions.push(gte(promptRuns.createdAt, fromDate));
		if (toDate) runConditions.push(lte(promptRuns.createdAt, toDate));

		// Run all queries in parallel for speed
		const [
			totalPromptsResult,
			totalRunsResult,
			visibilityStatsResult,
			recentActivityResult
		] = await Promise.all([
			// Get total prompts count
			db
				.select({ count: count() })
				.from(prompts)
				.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true))),

			// Get total runs count
			db
				.select({ count: count() })
				.from(promptRuns)
				.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
				.where(and(eq(prompts.brandId, brandId), ...runConditions)),

			// Get visibility statistics
			db
				.select({
					totalRuns: count(),
					brandMentions: sql<number>`SUM(CASE WHEN ${promptRuns.brandMentioned} THEN 1 ELSE 0 END)`,
					competitorMentions: sql<number>`SUM(CASE WHEN array_length(${promptRuns.competitorsMentioned}, 1) > 0 THEN 1 ELSE 0 END)`,
				})
				.from(promptRuns)
				.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
				.where(and(eq(prompts.brandId, brandId), ...runConditions)),

			// Get recent activity (last 7 days)
			db
				.select({
					date: sql<string>`DATE(${promptRuns.createdAt})`,
					runs: count(),
				})
				.from(promptRuns)
				.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
				.where(and(
					eq(prompts.brandId, brandId),
					gte(promptRuns.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
				))
				.groupBy(sql`DATE(${promptRuns.createdAt})`)
				.orderBy(sql`DATE(${promptRuns.createdAt}) DESC`)
				.limit(7)
		]);

		// Process results
		const totalPrompts = totalPromptsResult[0]?.count || 0;
		const totalRuns = totalRunsResult[0]?.count || 0;
		
		// Calculate average visibility
		const visibilityStats = visibilityStatsResult[0];
		let averageVisibility = 0;
		
		if (visibilityStats && Number(visibilityStats.totalRuns) > 0) {
			const totalRunsForVisibility = Number(visibilityStats.totalRuns);
			const brandMentions = Number(visibilityStats.brandMentions);
			const competitorMentions = Number(visibilityStats.competitorMentions);
			
			// Calculate weighted average (brand mentions count more)
			const weightedMentions = (brandMentions * 2) + competitorMentions;
			const totalPossibleMentions = totalRunsForVisibility * 3; // Max possible weighted score
			
			averageVisibility = Math.round((weightedMentions / totalPossibleMentions) * 100);
		}

		// Process recent activity
		const recentActivity = recentActivityResult.map(row => ({
			date: row.date,
			runs: Number(row.runs)
		}));

		const response: DashboardSummaryResponse = {
			totalPrompts: Number(totalPrompts),
			totalRuns: Number(totalRuns),
			averageVisibility,
			recentActivity
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching dashboard summary:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
