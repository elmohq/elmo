/** Server functions for prompt operations. */
import { createServerFn } from "@tanstack/react-start";
import { premiumSlotsUsed, selectPremiumModels } from "@workspace/config/plans";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, promptRuns, prompts, SYSTEM_TAGS } from "@workspace/lib/db/schema";
import { assertPromptSaveAllowed, type PromptSaveDelta } from "@workspace/lib/entitlements";
import { computeSystemTags, getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import type { LookbackPeriod } from "@/lib/chart-utils";
import { generateDateRange } from "@/lib/chart-utils";
import { rollUpCitationDomains, rollUpCitationUrls, tallyCitations } from "@/lib/citation-rollup";
import { extractDomain } from "@/lib/domain-categories";
import { classifyUrl } from "@/lib/domain-categories.server";
import { expeditePromptRuns } from "@/lib/expedite-prompts";
import { buildGoogleModule } from "@/lib/google-module";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";
import {
	type CitationUrlStats,
	getPromptCitationUrlStats,
	getPromptCompetitorDailyStats,
	getPromptDailyStats,
	getPromptsFirstEvaluatedAt,
	getPromptsSummary,
	getPromptWebQueriesForMapping,
	getPromptWebQueryCounts,
} from "@/lib/postgres-read";
import { promptsGainingPremium } from "@/lib/run-config-changes";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";
// Server Functions
// ============================================================================

/**
 * Get metadata for a single prompt
 */
export const getPromptMetadataFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), promptId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const prompt = await db.query.prompts.findFirst({
			where: and(eq(prompts.id, data.promptId), eq(prompts.brandId, data.brandId)),
		});

		if (!prompt) {
			return null;
		}

		let nextRunAt: string | null = null;
		try {
			const result = await db.execute(sql`
				SELECT start_after
				FROM pgboss.job
				WHERE name = 'process-prompt'
				  AND state IN ('created', 'retry')
				  AND (data->>'promptId') = ${data.promptId}
				  AND start_after > NOW()
				ORDER BY start_after ASC
				LIMIT 1
			`);
			const row = result.rows?.[0] as { start_after?: string } | undefined;
			if (row?.start_after) {
				nextRunAt = new Date(row.start_after).toISOString();
			}
		} catch {
			// pgboss schema may not exist yet — that's fine
		}

		return {
			id: prompt.id,
			brandId: prompt.brandId,
			value: prompt.value,
			enabled: prompt.enabled,
			tags: prompt.tags || [],
			systemTags: prompt.systemTags || [],
			nextRunAt,
		};
	});

/**
 * Get prompts summary for a brand (visibility scores, tags, etc.)
 */
export const getPromptsSummaryFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			lookback: z.string().optional().default("1m"),
			webSearchEnabled: z.string().optional(),
			model: z.string().optional(),
			tags: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const allPrompts = await db
			.select()
			.from(prompts)
			.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true)))
			.orderBy(desc(prompts.createdAt));

		const promptIds = allPrompts.map((p) => p.id);

		if (promptIds.length === 0) {
			return { prompts: [], totalPrompts: 0, availableTags: [] };
		}

		const timezone = "UTC";
		const { fromDateStr, toDateStr } = getTimezoneLookbackRange((data.lookback || "1m") as LookbackPeriod, timezone);

		const webSearchEnabled = data.webSearchEnabled != null ? data.webSearchEnabled === "true" : undefined;

		const [summaryData, firstEvaluatedData] = await Promise.all([
			getPromptsSummary(data.brandId, fromDateStr, toDateStr, timezone, webSearchEnabled, data.model, promptIds),
			getPromptsFirstEvaluatedAt(data.brandId, promptIds),
		]);

		const summaryMap = new Map(summaryData.map((s) => [s.prompt_id, s]));
		const firstEvalMap = new Map(firstEvaluatedData.map((f) => [f.prompt_id, f.first_evaluated_at]));

		// Collect all user tags (system tags are added separately)
		const allUserTags = new Set<string>();
		const tagFilter = data.tags?.split(",").filter(Boolean) || [];

		const promptSummaries = allPrompts.map((p) => {
			const stats = summaryMap.get(p.id);
			const userTags = p.tags || [];
			const effectiveStatus = getEffectiveBrandedStatus(p.systemTags || [], userTags);
			const systemTag = effectiveStatus.isBranded ? SYSTEM_TAGS.BRANDED : SYSTEM_TAGS.UNBRANDED;
			// Include exactly one effective system tag so both branded and
			// unbranded filters use the same status shown in the UI.
			const effectiveTags = userTags.includes(systemTag) ? [...userTags] : [...userTags, systemTag];

			for (const tag of userTags) allUserTags.add(tag);

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
				hasVisibilityData:
					totalRuns > 0 &&
					(Number(stats?.brand_mention_rate || 0) > 0 || Number(stats?.competitor_mention_rate || 0) > 0),
				lastRunAt: stats?.last_run_date ? new Date(stats.last_run_date) : null,
				firstEvaluatedAt: firstEvalMap.get(p.id) ? new Date(firstEvalMap.get(p.id)!) : null,
				tags: effectiveTags,
			};
		});

		const filteredPrompts =
			tagFilter.length > 0 ? promptSummaries.filter((p) => tagFilter.some((t) => p.tags.includes(t))) : promptSummaries;

		const sortedPrompts = filteredPrompts.sort((a, b) => {
			const getPriority = (prompt: typeof a): number => {
				if (prompt.hasVisibilityData) return 1;
				if (prompt.totalRuns === 0) return 2;
				return 3;
			};

			const priorityA = getPriority(a);
			const priorityB = getPriority(b);

			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}

			if (priorityA === 1 && a.averageWeightedMentions !== b.averageWeightedMentions) {
				return b.averageWeightedMentions - a.averageWeightedMentions;
			}

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

/**
 * Mirrors the brand-wide citations view (server/citations.ts) at the single-
 * prompt level: classify each citation at the URL level, pull Google AI Mode
 * search/shopping surfaces OUT of the source mix into a dedicated Google
 * Shopping module, and rebuild the domain distribution from the URL data.
 * Undefined when the prompt has nothing citable.
 */
function computePromptCitationStats(input: {
	urlStats: CitationUrlStats[];
	promptId: string;
	promptValue: string;
	brandName: string;
	brandDomains: Set<string>;
	competitors: { id: string; name: string }[];
	competitorDomains: Set<string>;
}) {
	const { urlStats } = input;
	if (urlStats.length === 0) return undefined;

	// Google AI Mode module: Shopping products (brand vs competitor) + search
	// queries. Built from the raw URL rows (it picks out the Google surfaces);
	// the rollup below drops those same surfaces from the source mix.
	const googleModule = buildGoogleModule(
		urlStats.map((u) => ({
			prompt_id: input.promptId,
			url: u.url,
			domain: u.domain,
			title: u.title,
			count: u.count,
		})),
		input.brandName,
		input.competitors,
		() => input.promptValue,
	);

	const specificUrls = rollUpCitationUrls(urlStats, (domain, url, title) =>
		classifyUrl(domain, url, title, input.brandDomains, input.competitorDomains),
	);
	const domainDistribution = rollUpCitationDomains(specificUrls);
	const { categoryCounts, totalCitations, pageTypeDistribution } = tallyCitations(specificUrls);
	if (totalCitations === 0) return undefined;

	return {
		totalCitations,
		uniqueDomains: domainDistribution.length,
		categoryCounts,
		domainDistribution,
		specificUrls,
		pageTypeDistribution,
		googleModule,
	};
}

/**
 * Get stats for a single prompt (mentions, web queries, citations)
 * Replicates: apps/web/src/app/api/prompts/[promptId]/stats/route.ts
 */
export const getPromptStatsFn = createServerFn({ method: "GET" })
	.validator(
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
		await requireBrandAccess(session.user.id, prompt[0].brandId);

		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - data.days);
		const toDate = new Date();
		const fromDateStr = fromDate.toISOString().split("T")[0];
		const toDateStr = toDate.toISOString().split("T")[0];
		const timezone = "UTC";
		const timeCondition = gte(promptRuns.createdAt, fromDate);

		const [mentionStatsResult, competitorMentionsResult] = await Promise.all([
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

			const competitorCounts: Record<string, number> = {};
			allCompetitors.forEach((c) => {
				competitorCounts[c.name] = 0;
			});

			competitorMentionsResult.forEach((row: any) => {
				(row.competitorsMentioned || []).forEach((name: string) => {
					if (name?.trim() && Object.hasOwn(competitorCounts, name)) {
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

		mentionStats.sort((a, b) => (a.count === b.count ? a.name.localeCompare(b.name) : b.count - a.count));

		// ---- Citation stats ----
		const [brandInfo, competitorsList] = await Promise.all([
			db
				.select({ name: brands.name, website: brands.website, additionalDomains: brands.additionalDomains })
				.from(brands)
				.where(eq(brands.id, prompt[0].brandId))
				.limit(1),
			db
				.select({ id: competitors.id, name: competitors.name, domains: competitors.domains })
				.from(competitors)
				.where(eq(competitors.brandId, prompt[0].brandId)),
		]);

		const primaryBrandDomain = brandInfo[0] ? extractDomain(brandInfo[0].website) : "";
		const additionalBrandDomains = (brandInfo[0]?.additionalDomains || []).map(extractDomain);
		const brandDomains = new Set([primaryBrandDomain, ...additionalBrandDomains].filter(Boolean));
		const competitorDomains = new Set(competitorsList.flatMap((c) => c.domains.map(extractDomain)).filter(Boolean));

		const urlStats = await getPromptCitationUrlStats(data.promptId, fromDateStr, toDateStr, timezone);

		const citationStats = computePromptCitationStats({
			urlStats,
			promptId: data.promptId,
			promptValue: prompt[0].value,
			brandName: brandInfo[0]?.name ?? "",
			brandDomains,
			competitors: competitorsList.map((c) => ({ id: c.id, name: c.name })),
			competitorDomains,
		});

		return {
			prompt: prompt[0],
			aggregations: {
				mentionStats,
				citationStats,
				totalRuns: Number(mentionData?.totalRuns || 0),
			},
		};
	});

/**
 * Get paginated prompt runs
 */
export const getPromptRunsFn = createServerFn({ method: "GET" })
	.validator(
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
		await requireBrandAccess(session.user.id, prompt.brandId);

		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - data.days);

		const offset = (data.page - 1) * data.limit;

		const [runs, totalResult] = await Promise.all([
			db.query.promptRuns.findMany({
				where: and(eq(promptRuns.promptId, data.promptId), gte(promptRuns.createdAt, fromDate)),
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
	.validator(
		z.object({
			brandId: z.string(),
			prompts: z
				.array(
					z.object({
						id: z.string().optional(),
						value: z.string(),
						enabled: z.boolean().optional().default(true),
						tags: z.array(z.string()).optional(),
						/**
						 * Premium models to track this prompt on, grounded — one of the org's
						 * premium slots each.
						 */
						premiumModels: z.array(z.string()).optional(),
					}),
				)
				.max(MAX_PROMPTS, `A brand may have at most ${MAX_PROMPTS} prompts.`),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, data.brandId),
		});
		if (!brand) throw new Error("Brand not found");

		const existingRows = await db
			.select({ id: prompts.id, enabled: prompts.enabled, premiumModels: prompts.premiumModels })
			.from(prompts)
			.where(eq(prompts.brandId, data.brandId));
		const existingIds = new Set(existingRows.map((p) => p.id));
		const existingById = new Map(existingRows.map((p) => [p.id, p]));

		// Plan pool accounting: the net number of prompts this save enables (new
		// enabled rows + disabled→enabled transitions − enabled→disabled), and the
		// net premium slots it spends — one per prompt/model pair, so a prompt
		// gaining a second premium model spends a second slot. Only a net increase
		// is guarded; going down never needs permission.
		const delta: PromptSaveDelta = { prompts: 0, premiumPairings: 0 };
		for (const p of data.prompts) {
			const before = p.id ? existingById.get(p.id) : undefined;
			if (p.id && !before) continue;
			const after = { enabled: p.enabled, premiumModels: selectPremiumModels(p.premiumModels) };
			delta.prompts += (p.enabled ? 1 : 0) - (before?.enabled ? 1 : 0);
			delta.premiumPairings += premiumSlotsUsed([after]) - premiumSlotsUsed(before ? [before] : []);
		}
		await assertPromptSaveAllowed(brand.organizationId, delta);

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
						premiumModels: selectPremiumModels(p.premiumModels),
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
						premiumModels: selectPremiumModels(p.premiumModels),
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

		// A grounded target added to a prompt that already runs has no history of
		// its own, so it is due immediately — but the prompt's next job is a whole
		// cadence away, and the customer has just paid for the slot.
		await expeditePromptRuns(promptsGainingPremium(existingById, saved));

		return saved;
	});

export const getPromptChartDataFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			promptId: z.string(),
			lookback: z.string().optional().default("1m"),
			webSearchEnabled: z.string().optional(),
			model: z.string().optional(),
			timezone: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const timezone = resolveTimezone(data.timezone);
		const lookbackParam = (data.lookback || "1m") as LookbackPeriod;
		const { fromDateStr } = getTimezoneLookbackRange(lookbackParam, timezone);
		// "all" leaves the query unbounded below; the chart still ends today, and
		// its start is pulled back to the first day with data once that is known.
		const toDateStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
		const endDate = new Date(toDateStr);
		let startDate = fromDateStr ? new Date(fromDateStr) : new Date();

		const [promptData, brandData, competitorsData] = await Promise.all([
			db
				.select({ id: prompts.id, value: prompts.value, brandId: prompts.brandId })
				.from(prompts)
				.where(eq(prompts.id, data.promptId))
				.limit(1),
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

		const [dailyStats, competitorStats, webQueryData] = await Promise.all([
			getPromptDailyStats(data.promptId, fromDateStr, toDateStr, timezone, webSearchEnabled, data.model),
			getPromptCompetitorDailyStats(data.promptId, fromDateStr, toDateStr, timezone, webSearchEnabled, data.model),
			getPromptWebQueriesForMapping(data.promptId, fromDateStr, toDateStr, timezone),
		]);

		if (lookbackParam === "all" && dailyStats.length > 0) {
			const sortedDates = dailyStats.map((s) => String(s.date)).sort();
			startDate = new Date(sortedDates[0]);
		}

		const dateRange = generateDateRange(startDate, endDate);

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

		const chartData = dateRange.map((date) => {
			const dayStat = dailyStatsMap.get(date);
			const totalRuns = dayStat?.total_runs || 0;
			const dataPoint: { date: string; [key: string]: number | string | null } = { date };

			if (totalRuns === 0) {
				dataPoint[brand.id] = null;
				sortedCompetitors.forEach((c) => {
					dataPoint[c.id] = null;
				});
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

			const seenModels = new Set(webQueryData.map((q) => q.model));
			for (const model of seenModels) {
				const modelQueries = webQueryData.filter((q) => q.model === model);
				if (modelQueries.length > 0) {
					const oldest = modelQueries[0];
					const oldestTime = new Date(oldest.created_at_iso).getTime();
					const sorted = modelQueries
						.filter((q) => new Date(q.created_at_iso).getTime() === oldestTime)
						.map((q) => q.web_query)
						.sort();
					if (sorted.length > 0) {
						if (!modelWebQueryMappings[model]) modelWebQueryMappings[model] = {};
						modelWebQueryMappings[model][data.promptId] = sorted[0];
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
	.validator(
		z.object({
			brandId: z.string(),
			promptId: z.string(),
			lookback: z.string().optional().default("1m"),
			model: z.string().optional(),
			timezone: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const timezone = resolveTimezone(data.timezone, "UTC");
		const { fromDateStr } = getTimezoneLookbackRange((data.lookback || "1m") as LookbackPeriod, timezone);
		const toDateStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

		const webQueryData = await getPromptWebQueryCounts(data.promptId, fromDateStr, toDateStr, timezone, data.model);

		let webQuery: string | null = null;
		const modelWebQueries: Record<string, string> = {};
		let maxOverallCount = 0;

		for (const row of webQueryData) {
			if (!modelWebQueries[row.model]) {
				modelWebQueries[row.model] = row.web_query;
			}
			if (row.query_count > maxOverallCount) {
				maxOverallCount = row.query_count;
				webQuery = row.web_query;
			}
		}

		return { webQuery, modelWebQueries };
	});
