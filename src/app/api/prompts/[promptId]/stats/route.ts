import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { promptRuns, prompts, brands, competitors } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, gte, sql, count, and } from "drizzle-orm";

type Params = {
	promptId: string;
};

export interface PromptStatsResponse {
	prompt: {
		id: string;
		brandId: string;
		value: string;
	};
	aggregations: {
		mentionStats: { name: string; count: number }[];
		webQueryStats: {
			overall: { name: string; count: number }[];
			byModel: Record<string, { name: string; count: number }[]>;
		};
		webSearchSummary: {
			enabled: number;
			disabled: number;
			percentage: number;
		};
		totalRuns: number;
	};
}

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { promptId } = await params;
		const { searchParams } = new URL(request.url);

		// Parse time filter (default to last 7 days for performance)
		const days = Math.max(1, Math.min(365, parseInt(searchParams.get("days") || "7")));
		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - days);

		// Check access control
		const userBrands = await getElmoOrgs();
		if (!userBrands || userBrands.length === 0) {
			return NextResponse.json({ error: "No accessible brands" }, { status: 403 });
		}

		const brandIds = userBrands.map((brand) => brand.id);

		// First verify the prompt exists and user has access to it
		const prompt = await db
			.select({
				id: prompts.id,
				brandId: prompts.brandId,
				value: prompts.value,
			})
			.from(prompts)
			.where(eq(prompts.id, promptId))
			.limit(1);

		if (prompt.length === 0) {
			return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
		}

		if (!brandIds.includes(prompt[0].brandId)) {
			return NextResponse.json({ error: "Access denied to this prompt" }, { status: 403 });
		}

		// Build time filter condition
		const timeCondition = gte(promptRuns.createdAt, fromDate);

		// Run aggregation queries in parallel
		const [
			mentionStatsResult,
			competitorMentionsResult,
			webQueryStatsResult,
			webSearchSummaryResult
		] = await Promise.all([
			// Get mention statistics (server-side aggregation)
			db
				.select({
					totalRuns: count(),
					brandMentions: sql<number>`SUM(CASE WHEN ${promptRuns.brandMentioned} THEN 1 ELSE 0 END)`,
				})
				.from(promptRuns)
				.where(and(eq(promptRuns.promptId, promptId), timeCondition)),

			// Get competitor mentions separately (to avoid unnest in aggregate issue)
			db
				.select({
					competitorsMentioned: promptRuns.competitorsMentioned,
				})
				.from(promptRuns)
				.where(and(eq(promptRuns.promptId, promptId), timeCondition, sql`array_length(${promptRuns.competitorsMentioned}, 1) > 0`)),

			// Get web query statistics (we'll process this client-side for now)
			db
				.select({
					modelGroup: promptRuns.modelGroup,
					webQueries: promptRuns.webQueries,
				})
				.from(promptRuns)
				.where(and(eq(promptRuns.promptId, promptId), timeCondition, sql`array_length(${promptRuns.webQueries}, 1) > 0`)),

			// Get web search usage summary
			db
				.select({
					totalRuns: count(),
					webSearchEnabled: sql<number>`SUM(CASE WHEN ${promptRuns.webSearchEnabled} THEN 1 ELSE 0 END)`,
				})
				.from(promptRuns)
				.where(and(eq(promptRuns.promptId, promptId), timeCondition))
		]);

		// Process mention stats
		const mentionData = mentionStatsResult[0];
		const mentionStats: { name: string; count: number }[] = [];
		
		if (mentionData) {
			// Get brand info and all competitors for proper naming
			const [brand, allCompetitors] = await Promise.all([
				db
					.select({ name: brands.name })
					.from(brands)
					.where(eq(brands.id, prompt[0].brandId))
					.limit(1),
				db
					.select({ name: competitors.name })
					.from(competitors)
					.where(eq(competitors.brandId, prompt[0].brandId))
			]);

			const brandName = brand[0]?.name;
			const totalRunsCount = Number(mentionData.totalRuns);
			const brandMentionsCount = Number(mentionData.brandMentions);

			// Add brand mentions
			if (brandName) {
				mentionStats.push({ name: brandName, count: brandMentionsCount });
			}

			// Initialize all competitors with 0 counts
			const competitorCounts: Record<string, number> = {};
			allCompetitors.forEach(competitor => {
				competitorCounts[competitor.name] = 0;
			});
			
			// Process competitor mentions from separate query
			competitorMentionsResult.forEach((row: any) => {
				const mentionedCompetitors = row.competitorsMentioned || [];
				mentionedCompetitors.forEach((competitor: string) => {
					if (competitor && competitor.trim()) {
						// Only count if this is a known competitor
						if (competitorCounts.hasOwnProperty(competitor)) {
							competitorCounts[competitor] = (competitorCounts[competitor] || 0) + 1;
						}
					}
				});
			});

			// Add all competitors (including those with 0 mentions)
			Object.entries(competitorCounts).forEach(([name, count]) => {
				mentionStats.push({ name, count });
			});

			// Calculate "no mentions" category properly
			// We need to count runs that have neither brand mentions nor any competitor mentions
			const noMentionRuns = await db
				.select({ count: count() })
				.from(promptRuns)
				.where(and(
					eq(promptRuns.promptId, promptId),
					timeCondition,
					eq(promptRuns.brandMentioned, false),
					sql`array_length(${promptRuns.competitorsMentioned}, 1) IS NULL OR array_length(${promptRuns.competitorsMentioned}, 1) = 0`
				));

			const noMentionCount = Number(noMentionRuns[0]?.count || 0);
			if (noMentionCount > 0) {
				mentionStats.push({ name: "(no brand mentions)", count: noMentionCount });
			}
		}

		// Sort mention stats by count (highest to lowest), but competitors with 0 values in alphabetical order
		mentionStats.sort((a, b) => {
			// If both have the same count, sort alphabetically
			if (a.count === b.count) {
				return a.name.localeCompare(b.name);
			}
			// Otherwise sort by count (highest to lowest)
			return b.count - a.count;
		});

		// Process web query stats
		const webQueryStats = {
			overall: [] as { name: string; count: number }[],
			byModel: {} as Record<string, { name: string; count: number }[]>
		};

		const allQueries: Record<string, number> = {};
		const modelQueries: Record<string, Record<string, number>> = {};
		
		webQueryStatsResult.forEach((row: any) => {
			const queries = row.webQueries || [];
			const modelGroup = row.modelGroup;

			if (!modelQueries[modelGroup]) {
				modelQueries[modelGroup] = {};
			}

			queries.forEach((query: string) => {
				if (query && query.trim()) {
					// Overall counts
					allQueries[query] = (allQueries[query] || 0) + 1;
					// Model-specific counts
					modelQueries[modelGroup][query] = (modelQueries[modelGroup][query] || 0) + 1;
				}
			});
		});

		// Convert to final format with specific order: openai, anthropic, google
		const modelOrder = ['openai', 'anthropic', 'google'];
		modelOrder.forEach(modelGroup => {
			if (modelQueries[modelGroup]) {
				webQueryStats.byModel[modelGroup] = Object.entries(modelQueries[modelGroup])
					.map(([name, count]) => ({ name, count }))
					.sort((a, b) => b.count - a.count)
					.slice(0, 15);
			}
		});

		// Convert overall queries to array and sort
		webQueryStats.overall = Object.entries(allQueries)
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 20);

		// Process web search summary
		const webSearchData = webSearchSummaryResult[0];
		const webSearchSummary = {
			enabled: Number(webSearchData?.webSearchEnabled || 0),
			disabled: Number(webSearchData?.totalRuns || 0) - Number(webSearchData?.webSearchEnabled || 0),
			percentage: webSearchData?.totalRuns 
				? Math.round((Number(webSearchData.webSearchEnabled) / Number(webSearchData.totalRuns)) * 100)
				: 0
		};

		const response: PromptStatsResponse = {
			prompt: prompt[0],
			aggregations: {
				mentionStats,
				webQueryStats,
				webSearchSummary,
				totalRuns: Number(mentionData?.totalRuns || 0)
			}
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching prompt stats:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
