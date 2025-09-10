import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, promptRuns } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, gte, lte, desc, count, sql } from "drizzle-orm";

type Params = {
	id: string;
};

export interface PromptSummary {
	id: string;
	value: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	enabled: boolean;
	createdAt: Date;
	// Aggregated stats
	totalRuns: number;
	brandMentionRate: number; // percentage of runs where brand was mentioned
	competitorMentionRate: number; // percentage of runs where any competitor was mentioned
	averageWeightedMentions: number; // average weighted mentions per run (brand = 2x, competitor = 1x each)
	hasVisibilityData: boolean;
	lastRunAt: Date | null;
}

export interface PromptsSummaryResponse {
	prompts: PromptSummary[];
	totalPrompts: number;
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
		const lookbackParam = searchParams.get("lookback");
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

		// Build query conditions for prompt runs
		const runConditions = [eq(prompts.brandId, brandId)];

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

		// Get prompts with aggregated run statistics
		const promptsWithStats = await db
			.select({
				id: prompts.id,
				value: prompts.value,
				groupCategory: prompts.groupCategory,
				groupPrefix: prompts.groupPrefix,
				enabled: prompts.enabled,
				createdAt: prompts.createdAt,
				totalRuns: count(promptRuns.id),
				brandMentions: sql<number>`SUM(CASE WHEN ${promptRuns.brandMentioned} THEN 1 ELSE 0 END)`,
				competitorMentions: sql<number>`SUM(CASE WHEN array_length(${promptRuns.competitorsMentioned}, 1) > 0 THEN 1 ELSE 0 END)`,
				totalWeightedMentions: sql<number>`SUM(
					CASE WHEN ${promptRuns.brandMentioned} THEN 2 ELSE 0 END +
					COALESCE(array_length(${promptRuns.competitorsMentioned}, 1), 0)
				)`,
				lastRunAt: sql<Date | null>`MAX(${promptRuns.createdAt})`,
			})
			.from(prompts)
			.leftJoin(promptRuns, eq(promptRuns.promptId, prompts.id))
			.where(and(...runConditions))
			.groupBy(
				prompts.id,
				prompts.value,
				prompts.groupCategory,
				prompts.groupPrefix,
				prompts.enabled,
				prompts.createdAt,
			)
			.orderBy(desc(prompts.createdAt));

		// Process the results to calculate rates and determine visibility
		const processedPrompts: PromptSummary[] = promptsWithStats.map((prompt) => {
			const totalRuns = Number(prompt.totalRuns);
			const brandMentions = Number(prompt.brandMentions);
			const competitorMentions = Number(prompt.competitorMentions);
			const totalWeightedMentions = Number(prompt.totalWeightedMentions);

			const brandMentionRate = totalRuns > 0 ? Math.round((brandMentions / totalRuns) * 100) : 0;
			const competitorMentionRate = totalRuns > 0 ? Math.round((competitorMentions / totalRuns) * 100) : 0;
			const averageWeightedMentions = totalRuns > 0 ? totalWeightedMentions / totalRuns : 0;
			
			// Consider prompt to have visibility data if there are any brand or competitor mentions
			const hasVisibilityData = brandMentions > 0 || competitorMentions > 0;

			return {
				id: prompt.id,
				value: prompt.value,
				groupCategory: prompt.groupCategory,
				groupPrefix: prompt.groupPrefix,
				enabled: prompt.enabled,
				createdAt: prompt.createdAt,
				totalRuns,
				brandMentionRate,
				competitorMentionRate,
				averageWeightedMentions,
				hasVisibilityData,
				lastRunAt: prompt.lastRunAt,
			};
		});

		// Filter to only enabled prompts and sort by priority
		const enabledPrompts = processedPrompts.filter((prompt) => prompt.enabled);
		
		// Sort by visibility data priority, then by weighted mentions, then alphabetically
		const sortedPrompts = enabledPrompts.sort((a, b) => {
			// Define priority order: 1 = has visibility data, 2 = awaiting first data, 3 = no brands found
			const getPriority = (prompt: PromptSummary): number => {
				if (prompt.hasVisibilityData) return 1; // Has visibility data - show first
				if (prompt.totalRuns === 0) return 2; // Awaiting first data - show second
				return 3; // Has runs but no visibility data (no brands found) - show last
			};

			const priorityA = getPriority(a);
			const priorityB = getPriority(b);

			// First sort by priority
			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}

			// Within same priority, sort by weighted mentions (descending) for items with visibility data
			if (priorityA === 1 && a.averageWeightedMentions !== b.averageWeightedMentions) {
				return b.averageWeightedMentions - a.averageWeightedMentions;
			}

			// Then sort alphabetically
			return a.value.localeCompare(b.value);
		});

		const response: PromptsSummaryResponse = {
			prompts: sortedPrompts,
			totalPrompts: sortedPrompts.length,
		};

		return NextResponse.json(response);
	} catch (error) {
		console.error("Error fetching prompts summary:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
