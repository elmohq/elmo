/**
 * Server functions for prompt operations.
 * Replaces apps/web/src/app/api/prompts/* and brands/[id]/prompts-summary API routes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { prompts, promptRuns, brands, competitors, SYSTEM_TAGS } from "@workspace/lib/db/schema";
import { eq, and, desc, gte, count, sql } from "drizzle-orm";
import {
	queryTinybird,
	getPromptsSummary,
	getPromptsFirstEvaluatedAt,
	getPromptCitationStats,
	getPromptCitationUrlStats,
	getPromptDailyStats,
	getPromptCompetitorDailyStats,
	getPromptWebQueriesForMapping,
} from "@/lib/tinybird-read-v2";
import { generateDateRange } from "@/lib/chart-utils";
import type { LookbackPeriod } from "@/lib/chart-utils";
import { getEffectiveBrandedStatus, computeSystemTags } from "@workspace/lib/tag-utils";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";

// ============================================================================
// Helpers
// ============================================================================

function extractDomain(urlOrDomain: string): string {
	try {
		const cleaned = urlOrDomain.replace(/^https?:\/\//, "");
		const withoutWww = cleaned.replace(/^www\./, "");
		return withoutWww.split("/")[0].toLowerCase();
	} catch {
		return urlOrDomain.toLowerCase();
	}
}

const SOCIAL_MEDIA_DOMAINS = [
	"facebook.com", "twitter.com", "x.com", "instagram.com", "linkedin.com",
	"youtube.com", "tiktok.com", "pinterest.com", "reddit.com", "snapchat.com",
	"tumblr.com", "whatsapp.com", "telegram.org", "discord.com", "twitch.tv",
];

function isSocialMediaDomain(domain: string): boolean {
	return SOCIAL_MEDIA_DOMAINS.some((sm) => domain === sm || domain.endsWith(`.${sm}`));
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get metadata for a single prompt
 */
export const getPromptMetadataFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ brandId: z.string(), promptId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const prompt = await db.query.prompts.findFirst({
			where: and(eq(prompts.id, data.promptId), eq(prompts.brandId, data.brandId)),
		});

		if (!prompt) {
			return null;
		}

		return {
			id: prompt.id,
			brandId: prompt.brandId,
			value: prompt.value,
			enabled: prompt.enabled,
			tags: prompt.tags || [],
			systemTags: prompt.systemTags || [],
		};
	});

/**
 * Get prompts summary for a brand (visibility scores, tags, etc.)
 */
export const getPromptsSummaryFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			lookback: z.string().optional().default("1m"),
			webSearchEnabled: z.string().optional(),
			modelGroup: z.string().optional(),
			tags: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		// Get all prompts for the brand from DB
		const allPrompts = await db
			.select()
			.from(prompts)
			.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true)))
			.orderBy(desc(prompts.createdAt));

		const promptIds = allPrompts.map((p) => p.id);

		if (promptIds.length === 0) {
			return { prompts: [], totalPrompts: 0, availableTags: [] };
		}

		// Compute date range from lookback parameter
		const timezone = "UTC";
		let fromDateStr: string | null = null;
		let toDateStr: string | null = null;

		const lookbackParam = data.lookback || "1m";
		if (lookbackParam && lookbackParam !== "all") {
			const toDate = new Date();
			const fromDate = new Date();
			switch (lookbackParam) {
				case "1w": fromDate.setDate(fromDate.getDate() - 7); break;
				case "1m": fromDate.setMonth(fromDate.getMonth() - 1); break;
				case "3m": fromDate.setMonth(fromDate.getMonth() - 3); break;
				case "6m": fromDate.setMonth(fromDate.getMonth() - 6); break;
				case "1y": fromDate.setFullYear(fromDate.getFullYear() - 1); break;
			}
			fromDateStr = fromDate.toISOString().split("T")[0];
			toDateStr = toDate.toISOString().split("T")[0];
		}

		// Parse webSearchEnabled
		const webSearchEnabled = data.webSearchEnabled != null ? data.webSearchEnabled === "true" : undefined;

		// Get stats from Tinybird
		const [summaryData, firstEvaluatedData] = await Promise.all([
			getPromptsSummary(
				data.brandId,
				fromDateStr,
				toDateStr,
				timezone,
				webSearchEnabled,
				data.modelGroup,
				promptIds,
			),
			getPromptsFirstEvaluatedAt(data.brandId, promptIds),
		]);

		// Build prompt summaries
		const summaryMap = new Map(summaryData.map((s) => [s.prompt_id, s]));
		const firstEvalMap = new Map(firstEvaluatedData.map((f) => [f.prompt_id, f.first_evaluated_at]));

		// Collect all user tags (system tags are added separately)
		const allUserTags = new Set<string>();
		const tagFilter = data.tags?.split(",").filter(Boolean) || [];

		const promptSummaries = allPrompts.map((p) => {
			const stats = summaryMap.get(p.id);
			const effectiveTags = [...(p.tags || [])];
			const effectiveStatus = getEffectiveBrandedStatus(p.systemTags || [], p.tags || []);
			if (effectiveStatus.isBranded) {
				effectiveTags.push(SYSTEM_TAGS.BRANDED);
			}

			for (const tag of (p.tags || [])) allUserTags.add(tag);

			const totalRuns = stats ? Number(stats.total_runs) : 0;
			const totalWeightedMentions = stats ? Number(stats.total_weighted_mentions) : 0;
			const averageWeightedMentions = totalRuns > 0 ? totalWeightedMentions / totalRuns : 0;

			return {
				id: p.id,
				value: p.value,
				enabled: p.enabled,
				createdAt: p.createdAt,
				totalRuns,
				brandMentionRate: stats ? Number(stats.brand_mention_rate) : 0,
				competitorMentionRate: stats ? Number(stats.competitor_mention_rate) : 0,
				averageWeightedMentions,
				hasVisibilityData: totalRuns > 0 && (Number(stats?.brand_mention_rate || 0) > 0 || Number(stats?.competitor_mention_rate || 0) > 0),
				lastRunAt: stats?.last_run_date ? new Date(stats.last_run_date) : null,
				firstEvaluatedAt: firstEvalMap.get(p.id) ? new Date(firstEvalMap.get(p.id)!) : null,
				tags: effectiveTags,
			};
		});

		// Apply tag filter
		const filteredPrompts = tagFilter.length > 0
			? promptSummaries.filter((p) => tagFilter.some((t) => p.tags.includes(t)))
			: promptSummaries;

		// Sort by visibility data priority, then by weighted mentions, then alphabetically
		const sortedPrompts = filteredPrompts.sort((a, b) => {
			// Define priority order: 1 = has visibility data, 2 = awaiting first data, 3 = no brands found
			const getPriority = (prompt: typeof a): number => {
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

		return {
			prompts: sortedPrompts,
			totalPrompts: promptSummaries.length,
			availableTags: [
				SYSTEM_TAGS.BRANDED,
				SYSTEM_TAGS.UNBRANDED,
				...Array.from(allUserTags)
					.filter((tag) => tag.toLowerCase() !== SYSTEM_TAGS.BRANDED && tag.toLowerCase() !== SYSTEM_TAGS.UNBRANDED)
					.sort(),
			],
		};
	});

// Helper to remove utm_source=openai from URLs
function normalizeUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		if (urlObj.searchParams.get("utm_source") === "openai") {
			urlObj.searchParams.delete("utm_source");
		}
		urlObj.search = urlObj.searchParams.toString();
		return urlObj.toString();
	} catch {
		return url;
	}
}

/**
 * Get stats for a single prompt (mentions, web queries, citations)
 * Replicates: apps/web/src/app/api/prompts/[promptId]/stats/route.ts
 */
export const getPromptStatsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			promptId: z.string(),
			days: z.number().optional().default(7),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();

		const prompt = await db
			.select({ id: prompts.id, brandId: prompts.brandId, value: prompts.value })
			.from(prompts)
			.where(eq(prompts.id, data.promptId))
			.limit(1);

		if (prompt.length === 0) throw new Error("Prompt not found");
		await requireOrgAccess(session.user.id, prompt[0].brandId);

		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - data.days);
		const toDate = new Date();
		const fromDateStr = fromDate.toISOString().split("T")[0];
		const toDateStr = toDate.toISOString().split("T")[0];
		const timezone = "UTC";
		const timeCondition = gte(promptRuns.createdAt, fromDate);

		// Run aggregation queries in parallel
		const [mentionStatsResult, competitorMentionsResult, webQueryStatsResult, webSearchSummaryResult] =
			await Promise.all([
				// Total runs + brand mentions
				db
					.select({
						totalRuns: count(),
						brandMentions: sql<number>`SUM(CASE WHEN ${promptRuns.brandMentioned} THEN 1 ELSE 0 END)`,
					})
					.from(promptRuns)
					.where(and(eq(promptRuns.promptId, data.promptId), timeCondition)),

				// Competitor mentions (separate to avoid unnest issues)
				db
					.select({ competitorsMentioned: promptRuns.competitorsMentioned })
					.from(promptRuns)
					.where(
						and(
							eq(promptRuns.promptId, data.promptId),
							timeCondition,
							sql`array_length(${promptRuns.competitorsMentioned}, 1) > 0`,
						),
					),

				// Web query stats
				db
					.select({ modelGroup: promptRuns.modelGroup, webQueries: promptRuns.webQueries })
					.from(promptRuns)
					.where(
						and(
							eq(promptRuns.promptId, data.promptId),
							timeCondition,
							sql`array_length(${promptRuns.webQueries}, 1) > 0`,
						),
					),

				// Web search summary
				db
					.select({
						totalRuns: count(),
						webSearchEnabled: sql<number>`SUM(CASE WHEN ${promptRuns.webSearchEnabled} THEN 1 ELSE 0 END)`,
					})
					.from(promptRuns)
					.where(and(eq(promptRuns.promptId, data.promptId), timeCondition)),
			]);

		// ---- Process mention stats ----
		const mentionData = mentionStatsResult[0];
		const mentionStats: { name: string; count: number }[] = [];

		if (mentionData) {
			const [brandResult, allCompetitors] = await Promise.all([
				db.select({ name: brands.name }).from(brands).where(eq(brands.id, prompt[0].brandId)).limit(1),
				db.select({ name: competitors.name }).from(competitors).where(eq(competitors.brandId, prompt[0].brandId)),
			]);

			const brandName = brandResult[0]?.name;
			if (brandName) {
				mentionStats.push({ name: brandName, count: Number(mentionData.brandMentions) });
			}

			// Initialize all competitors with 0 counts
			const competitorCounts: Record<string, number> = {};
			allCompetitors.forEach((c) => { competitorCounts[c.name] = 0; });

			// Tally competitor mentions
			competitorMentionsResult.forEach((row: any) => {
				(row.competitorsMentioned || []).forEach((name: string) => {
					if (name?.trim() && competitorCounts.hasOwnProperty(name)) {
						competitorCounts[name] += 1;
					}
				});
			});

			Object.entries(competitorCounts).forEach(([name, cnt]) => {
				mentionStats.push({ name, count: cnt });
			});

			// "no brand mentions" category
			const noMentionRuns = await db
				.select({ count: count() })
				.from(promptRuns)
				.where(
					and(
						eq(promptRuns.promptId, data.promptId),
						timeCondition,
						eq(promptRuns.brandMentioned, false),
						sql`array_length(${promptRuns.competitorsMentioned}, 1) IS NULL OR array_length(${promptRuns.competitorsMentioned}, 1) = 0`,
					),
				);

			const noMentionCount = Number(noMentionRuns[0]?.count || 0);
			if (noMentionCount > 0) {
				mentionStats.push({ name: "(no brand mentions)", count: noMentionCount });
			}
		}

		// Sort by count desc, then alphabetically
		mentionStats.sort((a, b) => (a.count === b.count ? a.name.localeCompare(b.name) : b.count - a.count));

		// ---- Process web query stats ----
		const allQueries: Record<string, number> = {};
		const modelQueries: Record<string, Record<string, number>> = {};

		webQueryStatsResult.forEach((row: any) => {
			const queries = row.webQueries || [];
			const modelGroup = row.modelGroup;
			if (!modelQueries[modelGroup]) modelQueries[modelGroup] = {};
			queries.forEach((query: string) => {
				if (query?.trim()) {
					allQueries[query] = (allQueries[query] || 0) + 1;
					modelQueries[modelGroup][query] = (modelQueries[modelGroup][query] || 0) + 1;
				}
			});
		});

		const webQueryStats: {
			overall: { name: string; count: number }[];
			byModel: Record<string, { name: string; count: number }[]>;
		} = { overall: [], byModel: {} };

		["openai", "anthropic", "google"].forEach((mg) => {
			if (modelQueries[mg]) {
				webQueryStats.byModel[mg] = Object.entries(modelQueries[mg])
					.map(([name, cnt]) => ({ name, count: cnt }))
					.sort((a, b) => b.count - a.count)
					.slice(0, 15);
			}
		});

		webQueryStats.overall = Object.entries(allQueries)
			.map(([name, cnt]) => ({ name, count: cnt }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 20);

		// ---- Web search summary ----
		const webSearchData = webSearchSummaryResult[0];
		const webSearchSummary = {
			enabled: Number(webSearchData?.webSearchEnabled || 0),
			disabled: Number(webSearchData?.totalRuns || 0) - Number(webSearchData?.webSearchEnabled || 0),
			percentage: webSearchData?.totalRuns
				? Math.round((Number(webSearchData.webSearchEnabled) / Number(webSearchData.totalRuns)) * 100)
				: 0,
		};

		// ---- Citation stats from Tinybird ----
		let citationStats = undefined;
		const [brandInfo, competitorsList] = await Promise.all([
			db.select({ website: brands.website }).from(brands).where(eq(brands.id, prompt[0].brandId)).limit(1),
			db.select({ domain: competitors.domain }).from(competitors).where(eq(competitors.brandId, prompt[0].brandId)),
		]);

		const brandDomain = brandInfo[0] ? extractDomain(brandInfo[0].website) : "";
		const competitorDomains = new Set(competitorsList.map((c) => extractDomain(c.domain)));

		const [domainStats, urlStats] = await Promise.all([
			getPromptCitationStats(data.promptId, fromDateStr, toDateStr, timezone),
			getPromptCitationUrlStats(data.promptId, fromDateStr, toDateStr, timezone),
		]);

		if (domainStats.length > 0) {
			const domainDistribution = domainStats.map(({ domain, count: cnt }) => {
				let category: "brand" | "competitor" | "social_media" | "other";
				if (domain === brandDomain || domain.endsWith(`.${brandDomain}`)) category = "brand";
				else if (competitorDomains.has(domain)) category = "competitor";
				else if (isSocialMediaDomain(domain)) category = "social_media";
				else category = "other";
				return { domain, count: Number(cnt), category };
			});

			const urlCounts = new Map<string, { count: number; title?: string; domain: string }>();
			for (const { url, domain, title, count: cnt } of urlStats) {
				const normalized = normalizeUrl(url);
				const existing = urlCounts.get(normalized);
				if (existing) {
					existing.count += Number(cnt);
					if (!existing.title && title) existing.title = title;
				} else {
					urlCounts.set(normalized, { count: Number(cnt), title: title || undefined, domain });
				}
			}

			const specificUrls = Array.from(urlCounts.entries())
				.map(([url, { count: cnt, title, domain }]) => {
					let category: "brand" | "competitor" | "social_media" | "other";
					if (domain === brandDomain || domain.endsWith(`.${brandDomain}`)) category = "brand";
					else if (competitorDomains.has(domain)) category = "competitor";
					else if (isSocialMediaDomain(domain)) category = "social_media";
					else category = "other";
					return { url, title, domain, count: cnt, category };
				})
				.sort((a, b) => b.count - a.count);

			const brandCitations = domainDistribution.filter((d) => d.category === "brand").reduce((s, d) => s + d.count, 0);
			const competitorCitations = domainDistribution.filter((d) => d.category === "competitor").reduce((s, d) => s + d.count, 0);
			const socialMediaCitations = domainDistribution.filter((d) => d.category === "social_media").reduce((s, d) => s + d.count, 0);
			const otherCitations = domainDistribution.filter((d) => d.category === "other").reduce((s, d) => s + d.count, 0);
			const totalCitations = brandCitations + competitorCitations + socialMediaCitations + otherCitations;

			if (totalCitations > 0) {
				citationStats = {
					totalCitations,
					uniqueDomains: domainDistribution.length,
					brandCitations,
					competitorCitations,
					socialMediaCitations,
					otherCitations,
					domainDistribution,
					specificUrls,
				};
			}
		}

		return {
			prompt: prompt[0],
			aggregations: {
				mentionStats,
				webQueryStats,
				webSearchSummary,
				citationStats,
				totalRuns: Number(mentionData?.totalRuns || 0),
			},
		};
	});

/**
 * Get paginated prompt runs
 */
export const getPromptRunsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			promptId: z.string(),
			page: z.number().optional().default(1),
			limit: z.number().optional().default(10),
			days: z.number().optional().default(7),
		}),
	)
	.handler(async ({ data }) => {
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, data.promptId),
		});
		if (!prompt) throw new Error("Prompt not found");

		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, prompt.brandId);

		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - data.days);

		const offset = (data.page - 1) * data.limit;

		const [runs, totalResult] = await Promise.all([
			db.query.promptRuns.findMany({
				where: and(
					eq(promptRuns.promptId, data.promptId),
					gte(promptRuns.createdAt, fromDate),
				),
				orderBy: desc(promptRuns.createdAt),
				limit: data.limit,
				offset,
			}),
			db
				.select({ count: count() })
				.from(promptRuns)
				.where(and(eq(promptRuns.promptId, data.promptId), gte(promptRuns.createdAt, fromDate))),
		]);

		return {
			runs: runs.map((r) => ({ ...r, rawOutput: r.rawOutput as {} })),
			total: totalResult[0]?.count || 0,
			page: data.page,
			limit: data.limit,
			hasMore: offset + runs.length < (totalResult[0]?.count || 0),
		};
	});

/**
 * Update prompts for a brand (add/edit/delete)
 */
export const updatePromptsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			prompts: z.array(
				z.object({
					id: z.string().optional(),
					value: z.string(),
					enabled: z.boolean().optional().default(true),
					tags: z.array(z.string()).optional(),
				}),
			),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, data.brandId),
		});
		if (!brand) throw new Error("Brand not found");

		const existingIds = new Set(
			(await db.select({ id: prompts.id }).from(prompts).where(eq(prompts.brandId, data.brandId)))
				.map((p) => p.id),
		);

		const saved = await db.transaction(async (tx) => {
			const toUpdate = data.prompts.filter((p) => p.id);
			const toInsert = data.prompts.filter((p) => !p.id);

			for (const p of toUpdate) {
				await tx
					.update(prompts)
					.set({
						value: p.value,
						enabled: p.enabled,
						tags: p.tags || [],
						systemTags: computeSystemTags(p.value, brand.name, brand.website),
					})
					.where(and(eq(prompts.id, p.id!), eq(prompts.brandId, data.brandId)));
			}

			if (toInsert.length > 0) {
				await tx.insert(prompts).values(
					toInsert.map((p) => ({
						brandId: data.brandId,
						value: p.value,
						enabled: p.enabled,
						tags: p.tags || [],
						systemTags: computeSystemTags(p.value, brand.name, brand.website),
					})),
				);
			}

			return tx.query.prompts.findMany({
				where: eq(prompts.brandId, data.brandId),
			});
		});

		const newPromptIds = saved.filter((p) => !existingIds.has(p.id)).map((p) => p.id);
		if (newPromptIds.length > 0) {
			createMultiplePromptJobSchedulers(newPromptIds).catch((err) =>
				console.error("Failed to create job schedulers for new prompts:", err),
			);
		}

		return saved;
	});

// ============================================================================
// Prompt Chart Data
// ============================================================================

export const getPromptChartDataFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			promptId: z.string(),
			lookback: z.string().optional().default("1m"),
			webSearchEnabled: z.string().optional(),
			modelGroup: z.string().optional(),
			timezone: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const timezone = data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
		const lookbackParam = (data.lookback || "1m") as LookbackPeriod;

		// Calculate date range
		let fromDateStr: string | null = null;
		let toDateStr: string | null = null;
		let startDate: Date;
		let endDate: Date;

		const now = new Date();
		const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });

		if (lookbackParam && lookbackParam !== "all") {
			toDateStr = todayStr;
			const fromDate = new Date(now);
			switch (lookbackParam) {
				case "1w": fromDate.setDate(fromDate.getDate() - 6); break;
				case "1m": fromDate.setMonth(fromDate.getMonth() - 1); break;
				case "3m": fromDate.setMonth(fromDate.getMonth() - 3); break;
				case "6m": fromDate.setMonth(fromDate.getMonth() - 6); break;
				case "1y": fromDate.setFullYear(fromDate.getFullYear() - 1); break;
			}
			fromDateStr = fromDate.toLocaleDateString("en-CA", { timeZone: timezone });
			startDate = new Date(fromDateStr);
			endDate = new Date(toDateStr);
		} else {
			toDateStr = todayStr;
			startDate = new Date();
			endDate = new Date(todayStr);
		}

		// Get metadata from DB
		const [promptData, brandData, competitorsData] = await Promise.all([
			db.select({ id: prompts.id, value: prompts.value, brandId: prompts.brandId })
				.from(prompts).where(eq(prompts.id, data.promptId)).limit(1),
			db.select().from(brands).where(eq(brands.id, data.brandId)).limit(1),
			db.select().from(competitors).where(eq(competitors.brandId, data.brandId)),
		]);

		if (promptData.length === 0) throw new Error("Prompt not found");
		if (brandData.length === 0) throw new Error("Brand not found");
		if (promptData[0].brandId !== data.brandId) throw new Error("Access denied");

		const prompt = promptData[0];
		const brand = brandData[0];
		const brandCompetitors = competitorsData;

		const webSearchEnabled = data.webSearchEnabled != null ? data.webSearchEnabled === "true" : undefined;

		// Get stats from Tinybird
		const [dailyStats, competitorStats, webQueryData] = await Promise.all([
			getPromptDailyStats(data.promptId, fromDateStr, toDateStr, timezone, webSearchEnabled, data.modelGroup),
			getPromptCompetitorDailyStats(data.promptId, fromDateStr, toDateStr, timezone, webSearchEnabled, data.modelGroup),
			getPromptWebQueriesForMapping(data.promptId, fromDateStr, toDateStr, timezone),
		]);

		if (lookbackParam === "all" && dailyStats.length > 0) {
			const sortedDates = dailyStats.map((s) => String(s.date)).sort();
			startDate = new Date(sortedDates[0]);
		}

		const dateRange = generateDateRange(startDate, endDate);

		// Build maps
		const dailyStatsMap = new Map<string, { total_runs: number; brand_mentioned_count: number }>();
		for (const stat of dailyStats) {
			dailyStatsMap.set(String(stat.date), {
				total_runs: Number(stat.total_runs),
				brand_mentioned_count: Number(stat.brand_mentioned_count),
			});
		}

		const competitorStatsMap = new Map<string, Map<string, number>>();
		for (const stat of competitorStats) {
			const dateStr = String(stat.date);
			if (!competitorStatsMap.has(dateStr)) competitorStatsMap.set(dateStr, new Map());
			competitorStatsMap.get(dateStr)!.set(stat.competitor_name, Number(stat.mention_count));
		}

		const sortedCompetitors = [...brandCompetitors].sort((a, b) => a.name.localeCompare(b.name));

		// Build chart data
		const chartData = dateRange.map((date) => {
			const dayStat = dailyStatsMap.get(date);
			const totalRuns = dayStat?.total_runs || 0;
			const dataPoint: { date: string; [key: string]: number | string | null } = { date };

			if (totalRuns === 0) {
				dataPoint[brand.id] = null;
				sortedCompetitors.forEach((c) => { dataPoint[c.id] = null; });
				return dataPoint;
			}

			dataPoint[brand.id] = Math.round(((dayStat?.brand_mentioned_count || 0) / totalRuns) * 100);

			const competitorCounts = competitorStatsMap.get(date) || new Map();
			sortedCompetitors.forEach((c) => {
				dataPoint[c.id] = Math.round(((competitorCounts.get(c.name) || 0) / totalRuns) * 100);
			});

			return dataPoint;
		});

		const totalRuns = dailyStats.reduce((sum, s) => sum + Number(s.total_runs), 0);
		const hasVisibilityData = chartData.some((dp) => {
			const allIds = [brand.id, ...sortedCompetitors.map((c) => c.id)];
			return allIds.some((id) => dp[id] !== null && dp[id] !== undefined && Number(dp[id]) > 0);
		});
		const lastDataPoint = chartData.filter((p) => p[brand.id] !== null).pop();
		const lastBrandVisibility = lastDataPoint ? (lastDataPoint[brand.id] as number) : null;

		// Web query mappings
		const webQueryMapping: Record<string, string> = {};
		const modelWebQueryMappings: Record<string, Record<string, string>> = {};

		if (webQueryData.length > 0) {
			const oldestQuery = webQueryData[0];
			if (oldestQuery) {
				const oldestTime = new Date(oldestQuery.created_at_iso).getTime();
				const oldestQueries = webQueryData
					.filter((q) => new Date(q.created_at_iso).getTime() === oldestTime)
					.map((q) => q.web_query)
					.sort();
				if (oldestQueries.length > 0) webQueryMapping[data.promptId] = oldestQueries[0];
			}

			for (const modelGroup of ["openai", "anthropic", "google"]) {
				const modelQueries = webQueryData.filter((q) => q.model_group === modelGroup);
				if (modelQueries.length > 0) {
					const oldest = modelQueries[0];
					const oldestTime = new Date(oldest.created_at_iso).getTime();
					const sorted = modelQueries
						.filter((q) => new Date(q.created_at_iso).getTime() === oldestTime)
						.map((q) => q.web_query)
						.sort();
					if (sorted.length > 0) {
						if (!modelWebQueryMappings[modelGroup]) modelWebQueryMappings[modelGroup] = {};
						modelWebQueryMappings[modelGroup][data.promptId] = sorted[0];
					}
				}
			}
		}

		return {
			prompt: { id: prompt.id, value: prompt.value },
			chartData,
			brand,
			competitors: brandCompetitors,
			totalRuns,
			hasVisibilityData,
			lastBrandVisibility,
			webQueryMapping,
			modelWebQueryMappings,
		};
	});

// ============================================================================
// Web Query Lookup (for OptimizeButton)
// ============================================================================

export const getPromptWebQueryFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			promptId: z.string(),
			lookback: z.string().optional().default("1m"),
			modelGroup: z.string().optional(),
			timezone: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const timezone = data.timezone || "UTC";
		const now = new Date();
		const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });
		const toDateStr = todayStr;
		let fromDateStr: string | null = null;

		if (data.lookback && data.lookback !== "all") {
			const fromDate = new Date(now);
			switch (data.lookback) {
				case "1w": fromDate.setDate(fromDate.getDate() - 6); break;
				case "1m": fromDate.setMonth(fromDate.getMonth() - 1); break;
				case "3m": fromDate.setMonth(fromDate.getMonth() - 3); break;
				case "6m": fromDate.setMonth(fromDate.getMonth() - 6); break;
				case "1y": fromDate.setFullYear(fromDate.getFullYear() - 1); break;
			}
			fromDateStr = fromDate.toLocaleDateString("en-CA", { timeZone: timezone });
		}

		const webQueryData = await getPromptWebQueryCounts(
			data.promptId,
			fromDateStr,
			toDateStr,
			timezone,
			data.modelGroup,
		);

		let webQuery: string | null = null;
		const modelWebQueries: Record<string, string> = {};
		let maxOverallCount = 0;

		for (const row of webQueryData) {
			if (!modelWebQueries[row.model_group]) {
				modelWebQueries[row.model_group] = row.web_query;
			}
			if (row.query_count > maxOverallCount) {
				maxOverallCount = row.query_count;
				webQuery = row.web_query;
			}
		}

		return { webQuery, modelWebQueries };
	});
