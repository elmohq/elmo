import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, SYSTEM_TAGS } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, desc } from "drizzle-orm";
import { getTinybirdPromptsSummary } from "@/lib/tinybird-read";

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
	// Tags - includes user tags + computed system tag
	tags: string[];
}

export interface PromptsSummaryResponse {
	prompts: PromptSummary[];
	totalPrompts: number;
	availableTags: string[]; // All unique tags including system tags
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
		const tagsParam = searchParams.get("tags"); // comma-separated tag names for filtering

		// Use UTC for date filtering to match PostgreSQL behavior
		const timezone = "UTC";

		let fromDateStr: string | null = null;
		let toDateStr: string | null = null;

		// Handle lookback periods
		if (lookbackParam && lookbackParam !== "all") {
			const toDate = new Date();
			const fromDate = new Date();

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

			fromDateStr = fromDate.toISOString().split("T")[0];
			toDateStr = toDate.toISOString().split("T")[0];
		}

		// Validate modelGroup if specified
		if (modelGroupParam) {
			const validModelGroups = ["openai", "anthropic", "google"];
			if (!validModelGroups.includes(modelGroupParam)) {
				return NextResponse.json({ error: "Invalid model group. Use: openai, anthropic, or google" }, { status: 400 });
			}
		}

		// Get all prompts with metadata from PostgreSQL
		const allPrompts = await db
			.select({
				id: prompts.id,
				value: prompts.value,
				groupCategory: prompts.groupCategory,
				groupPrefix: prompts.groupPrefix,
				enabled: prompts.enabled,
				tags: prompts.tags,
				systemTags: prompts.systemTags,
				createdAt: prompts.createdAt,
			})
			.from(prompts)
			.where(eq(prompts.brandId, brandId))
			.orderBy(desc(prompts.createdAt));

		// Filter to enabled prompts
		const enabledPrompts = allPrompts.filter((p) => p.enabled);
		const enabledPromptIds = enabledPrompts.map((p) => p.id);

		// Collect all unique user tags from enabled prompts
		const allUserTags = new Set<string>();
		for (const p of enabledPrompts) {
			if (p.tags && Array.isArray(p.tags)) {
				p.tags.forEach((tag) => allUserTags.add(tag));
			}
		}

		// Get stats from Tinybird
		const webSearchEnabled = webSearchEnabledParam !== null ? webSearchEnabledParam === "true" : undefined;
		
		const tinybirdStats = await getTinybirdPromptsSummary(
			brandId,
			fromDateStr,
			toDateStr,
			timezone,
			webSearchEnabled,
			modelGroupParam || undefined,
			enabledPromptIds,
		);

		// Create a map of prompt_id -> stats from Tinybird
		const statsMap = new Map<string, {
			totalRuns: number;
			brandMentionRate: number;
			competitorMentionRate: number;
			totalWeightedMentions: number;
			lastRunDate: string | null;
		}>();

		for (const stat of tinybirdStats) {
			statsMap.set(stat.prompt_id, {
				totalRuns: Number(stat.total_runs),
				brandMentionRate: Number(stat.brand_mention_rate),
				competitorMentionRate: Number(stat.competitor_mention_rate),
				totalWeightedMentions: Number(stat.total_weighted_mentions),
				lastRunDate: stat.last_run_date,
			});
		}

		// Process prompts and merge with Tinybird stats
		const processedPrompts: PromptSummary[] = enabledPrompts.map((prompt) => {
			const stats = statsMap.get(prompt.id);
			
			const totalRuns = stats?.totalRuns || 0;
			const brandMentionRate = stats?.brandMentionRate || 0;
			const competitorMentionRate = stats?.competitorMentionRate || 0;
			const totalWeightedMentions = stats?.totalWeightedMentions || 0;
			const averageWeightedMentions = totalRuns > 0 ? totalWeightedMentions / totalRuns : 0;
			
			// Consider prompt to have visibility data if there are any brand or competitor mentions
			const hasVisibilityData = brandMentionRate > 0 || competitorMentionRate > 0;

			// Combine system tags and user tags for response
			const userTags = prompt.tags || [];
			const systemTags = prompt.systemTags || [];
			const allTags = [...systemTags, ...userTags];

			// Parse lastRunDate - Tinybird returns date string, convert to Date
			let lastRunAt: Date | null = null;
			if (stats?.lastRunDate) {
				lastRunAt = new Date(stats.lastRunDate);
			}

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
				lastRunAt,
				tags: allTags,
			};
		});

		// Filter by tags if specified
		let filteredPrompts = processedPrompts;
		if (tagsParam) {
			const filterTags = tagsParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
			if (filterTags.length > 0) {
				filteredPrompts = processedPrompts.filter((prompt) =>
					prompt.tags.some((tag) => filterTags.includes(tag.toLowerCase())),
				);
			}
		}
		
		// Sort by visibility data priority, then by weighted mentions, then alphabetically
		const sortedPrompts = filteredPrompts.sort((a, b) => {
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

		// Build available tags list: system tags + all user tags
		const availableTags = [
			SYSTEM_TAGS.BRANDED,
			SYSTEM_TAGS.UNBRANDED,
			...Array.from(allUserTags).sort(),
		];

		const response: PromptsSummaryResponse = {
			prompts: sortedPrompts,
			totalPrompts: sortedPrompts.length,
			availableTags,
		};

		return NextResponse.json(response);
	} catch (error) {
		console.error("Error fetching prompts summary:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
