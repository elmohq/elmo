import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, promptRuns, SYSTEM_TAGS } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, gte, lte, desc, count, sql } from "drizzle-orm";
import { isTinybirdVerifyEnabled, verifyAndLog, type DiagnosticInfo } from "@/lib/tinybird-comparison";
import { getTinybirdPromptsSummary, getTinybirdPromptRunDiagnostics, isTinybirdReadEnabled } from "@/lib/tinybird-read";

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

		// Start timing PostgreSQL queries
		const startPg = performance.now();

		// Get prompts with aggregated run statistics
		const promptsWithStats = await db
			.select({
				id: prompts.id,
				value: prompts.value,
				groupCategory: prompts.groupCategory,
				groupPrefix: prompts.groupPrefix,
				enabled: prompts.enabled,
				tags: prompts.tags,
				systemTags: prompts.systemTags,
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
				prompts.tags,
				prompts.systemTags,
				prompts.createdAt,
			)
			.orderBy(desc(prompts.createdAt));

		// Fetch all unique user tags from ALL enabled prompts for this brand
		// (not filtered by time period, so tags are always available for filtering)
		const allEnabledPrompts = await db
			.select({ tags: prompts.tags })
			.from(prompts)
			.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true)));

		const allUserTags = new Set<string>();
		for (const p of allEnabledPrompts) {
			if (p.tags && Array.isArray(p.tags)) {
				p.tags.forEach((tag) => allUserTags.add(tag));
			}
		}

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

			// Combine system tags and user tags for response
			const userTags = prompt.tags || [];
			const systemTags = prompt.systemTags || [];
			const allTags = [...systemTags, ...userTags];

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
				tags: allTags,
			};
		});

		// Filter to only enabled prompts
		let enabledPrompts = processedPrompts.filter((prompt) => prompt.enabled);

		// Filter by tags if specified
		if (tagsParam) {
			const filterTags = tagsParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
			if (filterTags.length > 0) {
				enabledPrompts = enabledPrompts.filter((prompt) =>
					prompt.tags.some((tag) => filterTags.includes(tag.toLowerCase())),
				);
			}
		}
		
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

		// Build available tags list: system tags + all user tags
		const availableTags = [
			SYSTEM_TAGS.BRANDED,
			SYSTEM_TAGS.UNBRANDED,
			...Array.from(allUserTags).sort(),
		];

		// End PostgreSQL timing
		const pgTime = performance.now() - startPg;

		const response: PromptsSummaryResponse = {
			prompts: sortedPrompts,
			totalPrompts: sortedPrompts.length,
			availableTags,
		};

		// Dual-read verification against Tinybird (awaited to ensure completion in serverless)
		if (isTinybirdVerifyEnabled() && isTinybirdReadEnabled()) {
			try {
				const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
				const fromDateStr = fromDate ? fromDate.toISOString().split("T")[0] : null;
				const toDateStr = toDate ? toDate.toISOString().split("T")[0] : null;
				const webSearchEnabled = webSearchEnabledParam !== null ? webSearchEnabledParam === "true" : undefined;

				// Get enabled prompt IDs for filtering Tinybird
				const enabledPromptIds = sortedPrompts.map((p) => p.id);

				const startTb = performance.now();
				const [tinybirdResult, tbDiagnostics] = await Promise.all([
					getTinybirdPromptsSummary(
						brandId,
						fromDateStr,
						toDateStr,
						userTimezone,
						webSearchEnabled,
						modelGroupParam || undefined,
						enabledPromptIds,
					),
					// Only run diagnostics if we have date filters
					fromDateStr && toDateStr
						? getTinybirdPromptRunDiagnostics(
								brandId,
								fromDateStr,
								toDateStr,
								userTimezone,
								enabledPromptIds,
						  )
						: Promise.resolve(null),
				]);
				const tbTime = performance.now() - startTb;

				// Compare aggregate metrics for enabled prompts
				const pgTotalRuns = sortedPrompts.reduce((sum, p) => sum + p.totalRuns, 0);
				const tbTotalRuns = tinybirdResult.reduce((sum, r) => sum + Number(r.total_runs), 0);

				const pgComparable = {
					totalPrompts: sortedPrompts.length,
					totalRuns: pgTotalRuns,
				};

				const tbComparable = {
					totalPrompts: tinybirdResult.length,
					totalRuns: tbTotalRuns,
				};

				// Build diagnostics
				let diagnostics: DiagnosticInfo | undefined;
				if (tbDiagnostics) {
					// Build per-prompt counts from PG (already have this from sortedPrompts)
					const pgPerPromptCounts: Record<string, number> = {};
					for (const p of sortedPrompts) {
						pgPerPromptCounts[p.id] = p.totalRuns;
					}

					// Build TB per-prompt counts from the prompts-summary result
					const tbPerPromptCounts: Record<string, number> = {};
					for (const r of tinybirdResult) {
						tbPerPromptCounts[r.prompt_id] = Number(r.total_runs);
					}

					// Find differences between PG and TB per-prompt counts
					const allPromptIdsSet = new Set([
						...Object.keys(pgPerPromptCounts),
						...Object.keys(tbPerPromptCounts),
					]);
					const differences: Array<{ promptId: string; pgCount: number; tbCount: number; diff: number }> = [];
					for (const promptId of allPromptIdsSet) {
						const pgCount = pgPerPromptCounts[promptId] || 0;
						const tbCount = tbPerPromptCounts[promptId] || 0;
						if (pgCount !== tbCount) {
							differences.push({
								promptId,
								pgCount,
								tbCount,
								diff: tbCount - pgCount,
							});
						}
					}
					// Sort by absolute difference
					differences.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

					diagnostics = {
						dateRange: {
							pg: { earliest: null, latest: null }, // Not easily available from sortedPrompts
							tb: {
								earliest: tbDiagnostics.earliest_date,
								latest: tbDiagnostics.latest_date,
							},
						},
						recordCounts: {
							pg: pgTotalRuns,
							tb: Number(tbDiagnostics.total_count),
						},
						perPromptCounts: {
							pg: pgPerPromptCounts,
							tb: tbPerPromptCounts,
							differences: differences.slice(0, 20), // Top 20 differences
						},
						extra: {
							enabledPromptIdCount: enabledPromptIds.length,
							pgPromptCount: sortedPrompts.length,
							tbPromptCount: tinybirdResult.length,
							tbDiagPromptCount: tbDiagnostics.per_prompt_counts.length,
							webSearchEnabled,
							modelGroup: modelGroupParam,
						},
					};
				}

				await verifyAndLog({
					endpoint: "prompts-summary",
					brandId,
					filters: {
						lookback: lookbackParam,
						webSearchEnabled: webSearchEnabledParam,
						modelGroup: modelGroupParam,
						tags: tagsParam,
					},
					postgresResult: pgComparable,
					tinybirdResult: tbComparable,
					pgTime,
					tbTime,
					diagnostics,
				});
			} catch (error) {
				console.error("Tinybird verification failed for prompts-summary:", error);
			}
		}

		return NextResponse.json(response);
	} catch (error) {
		console.error("Error fetching prompts summary:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
