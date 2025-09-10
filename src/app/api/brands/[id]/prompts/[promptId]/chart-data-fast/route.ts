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

export interface PromptChartDataFastResponse {
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

		// Calculate date range first
		let fromDate: Date | undefined;
		let toDate: Date | undefined;

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
		const chartData = calculateVisibilityPercentages(runs, brand, brandCompetitors, lookbackParam);

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

		const response: PromptChartDataFastResponse = {
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
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching fast prompt chart data:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
