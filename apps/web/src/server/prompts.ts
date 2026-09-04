/** Server functions for prompt operations. */
import { createServerFn } from "@tanstack/react-start";
import { extractDomain } from "@workspace/lib/citations/domain-categories";
import { classifyUrl } from "@workspace/lib/citations/domain-lists";
import { rollUpCitationDomains, rollUpCitationUrls, tallyCitations } from "@workspace/lib/citations/rollup";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, promptRuns, prompts, SYSTEM_TAGS } from "@workspace/lib/db/schema";
import {
	assertAllowed,
	assertPromptSaveAllowed,
	decidePromptCap,
	promptSaveDelta,
	withQuotaLock,
} from "@workspace/lib/entitlements";
import { computeSystemTags, getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireBrandAccess, requireBrandSession } from "@/lib/auth/helpers";
import { generateDateRange } from "@/lib/chart-utils";
import { expeditePromptRuns } from "@/lib/expedite-prompts";
import { buildGoogleModule } from "@/lib/google-module";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";
import type { LookbackPeriod } from "@/lib/lookback";
import {
	type CitationUrlStats,
	getPromptCitationUrlStats,
	getPromptsFirstEvaluatedAt,
	getPromptsSummary,
	getPromptWebQueryCounts,
} from "@/lib/postgres-read";
import { promptsGainingPremium } from "@/lib/run-config-changes";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";
import { parseTagFilter } from "@/server/prompt-resolution";
import { planPromptSave } from "@/server/prompt-save";
// Server Functions
// ============================================================================

/**
 * Get metadata for a single prompt
 */
export const getPromptMetadataFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), promptId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

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
type PromptSummaryStat = Awaited<ReturnType<typeof getPromptsSummary>>[number];

function summarizePrompt(
	prompt: {
		id: string;
		value: string;
		enabled: boolean;
		createdAt: Date;
		tags: string[] | null;
		systemTags: string[] | null;
	},
	stats: PromptSummaryStat | undefined,
	firstEvaluatedAt: string | Date | null | undefined,
) {
	const userTags = prompt.tags || [];
	const { isBranded } = getEffectiveBrandedStatus(prompt.systemTags || [], userTags);
	const systemTag = isBranded ? SYSTEM_TAGS.BRANDED : SYSTEM_TAGS.UNBRANDED;
	const totalRuns = Number(stats?.total_runs ?? 0);
	// The query answers in ratios so the API can publish them unrounded; the
	// dashboard renders percentages, and this is where it rounds.
	const brandMentionRate = Math.round(Number(stats?.brand_mention_rate ?? 0) * 100);
	const competitorMentionRate = Math.round(Number(stats?.competitor_mention_rate ?? 0) * 100);

	return {
		id: prompt.id,
		value: prompt.value,
		enabled: prompt.enabled,
		createdAt: prompt.createdAt,
		totalRuns,
		brandMentionRate,
		competitorMentionRate,
		averageWeightedMentions: totalRuns > 0 ? Number(stats?.total_weighted_mentions ?? 0) / totalRuns : 0,
		hasVisibilityData: totalRuns > 0 && (brandMentionRate > 0 || competitorMentionRate > 0),
		lastRunAt: stats?.last_run_date ? new Date(stats.last_run_date) : null,
		firstEvaluatedAt: firstEvaluatedAt ? new Date(firstEvaluatedAt) : null,
		// Exactly one effective system tag, so branded and unbranded filters use
		// the same status the UI shows.
		tags: userTags.includes(systemTag) ? [...userTags] : [...userTags, systemTag],
	};
}

type PromptSummary = ReturnType<typeof summarizePrompt>;

function byVisibilityThenName(a: PromptSummary, b: PromptSummary): number {
	const rank = (prompt: PromptSummary) => (prompt.hasVisibilityData ? 1 : prompt.totalRuns === 0 ? 2 : 3);
	const rankA = rank(a);
	if (rankA !== rank(b)) return rankA - rank(b);
	if (rankA === 1 && a.averageWeightedMentions !== b.averageWeightedMentions) {
		return b.averageWeightedMentions - a.averageWeightedMentions;
	}
	return a.value.localeCompare(b.value);
}

export const getPromptsSummaryFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			lookback: z.string().optional().default("1m"),
			webSearchEnabled: z.string().optional(),
			model: z.string().optional(),
			tags: z.string().optional(),
			timezone: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		const allPrompts = await db
			.select()
			.from(prompts)
			.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true)))
			.orderBy(desc(prompts.createdAt));

		const promptIds = allPrompts.map((p) => p.id);

		if (promptIds.length === 0) {
			return { prompts: [], totalPrompts: 0, availableTags: [] };
		}

		const timezone = resolveTimezone(data.timezone, "UTC");
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
		const tagFilter = parseTagFilter(data.tags);

		const promptSummaries = allPrompts.map((p) => {
			for (const tag of p.tags || []) allUserTags.add(tag);
			return summarizePrompt(p, summaryMap.get(p.id), firstEvalMap.get(p.id));
		});

		const filteredPrompts =
			tagFilter.length > 0 ? promptSummaries.filter((p) => tagFilter.some((t) => p.tags.includes(t))) : promptSummaries;
		const sortedPrompts = filteredPrompts.sort(byVisibilityThenName);

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

		await requireBrandSession(prompt.brandId);

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
			// Rows written before extraction was versioned carry no text, so they are
			// extracted on read; the model name is the extractor's other accepted key
			// for rows that also predate the provider column.
			runs: runs.map((r) => ({
				...r,
				rawOutput: r.rawOutput as {},
				textContent: r.textContent ?? extractTextContent(r.rawOutput, r.provider ?? r.model),
			})),
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
			// No .max() here: brands can already be over MAX_PROMPTS. decidePromptCap
			// checks how many rows the save inserts instead.
			prompts: z.array(
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
			),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

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

		const { updates, inserts } = planPromptSave(data.prompts, existingRows);
		assertAllowed(decidePromptCap(existingRows.length, inserts.length));
		await assertPromptSaveAllowed(brand.organizationId, promptSaveDelta({ updates, inserts }));

		const saved = await db.transaction(async (tx) => {
			for (const { id, prompt, after } of updates) {
				await tx
					.update(prompts)
					.set({
						value: prompt.value,
						enabled: prompt.enabled,
						tags: prompt.tags || [],
						systemTags: computeSystemTags(prompt.value, brand.name, brand.website),
						premiumModels: after.premiumModels,
					})
					.where(and(eq(prompts.id, id), eq(prompts.brandId, data.brandId)));
			}

			if (inserts.length > 0) {
				await tx.insert(prompts).values(
					inserts.map(({ prompt, after }) => ({
						brandId: data.brandId,
						value: prompt.value,
						enabled: prompt.enabled,
						tags: prompt.tags || [],
						systemTags: computeSystemTags(prompt.value, brand.name, brand.website),
						premiumModels: after.premiumModels,
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
		await requireBrandSession(data.brandId);

		const timezone = resolveTimezone(data.timezone, "UTC");
		const { fromDateStr } = getTimezoneLookbackRange((data.lookback || "1m") as LookbackPeriod, timezone);
		const toDateStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

		const webQueryData = await getPromptWebQueryCounts(data.promptId, fromDateStr, toDateStr, timezone, data.model);

		let webQuery: string | null = null;
		let maxOverallCount = 0;

		for (const row of webQueryData) {
			if (row.query_count > maxOverallCount) {
				maxOverallCount = row.query_count;
				webQuery = row.web_query;
			}
		}

		return { webQuery };
	});
