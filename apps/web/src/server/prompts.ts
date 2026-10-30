/** Server functions for prompt operations. */

import { createServerFn } from "@tanstack/react-start";
import { extractDomain } from "@workspace/lib/citations/domain-categories";
import { rollUpCitationDomains, rollUpCitationUrls, tallyCitations } from "@workspace/lib/citations/rollup";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { assertAllowed, assertPromptSaveAllowed, decidePromptCap, promptSaveDelta } from "@workspace/lib/entitlements";
import { bucketStart, markPromptRunsDirty } from "@workspace/lib/rollups";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { pgReader } from "@/lib/analytics/pg-reader";
import { requireAuthSession, requireBrandAccess, requireBrandSession } from "@/lib/auth/helpers";
import { expeditePromptRuns } from "@/lib/expedite-prompts";
import { buildGoogleModule } from "@/lib/google-module";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";
import { customRangeEnd, lookbackSchema } from "@/lib/lookback";
import {
	getPromptWebQueryCounts,
	getResponseMatches,
	getResponseSentimentCounts,
	type ResponseSearchScope,
} from "@/lib/postgres-read";
import type { CitationUrlStats } from "@/lib/rollup-read";
import { promptsGainingPremium } from "@/lib/run-config-changes";
import { responseSortSchema, sentimentFilterSchema } from "@/lib/sentiment";
import { isRedditDomain, summarizeSubreddits } from "@/lib/subreddits";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";
import { resolveBrandLookbackDays } from "@/server/brand-window";
import { planPromptSave } from "@/server/prompt-save";
import { toResponse } from "@/server/responses";
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

	const specificUrls = rollUpCitationUrls(urlStats, input.brandDomains, input.competitorDomains);
	const domainDistribution = rollUpCitationDomains(specificUrls);
	const { categoryCounts, totalCitations, pageTypeDistribution } = tallyCitations(specificUrls);
	if (totalCitations === 0) return undefined;

	return {
		totalCitations,
		uniqueDomains: domainDistribution.length,
		categoryCounts,
		domainDistribution,
		specificUrls,
		subreddits: summarizeSubreddits(specificUrls.filter((url) => isRedditDomain(url.domain))),
		pageTypeDistribution,
		googleModule,
	};
}

/** Run window for the prompt detail endpoints: the last `days` up to now, or —
 *  for a custom range — the `days` UTC calendar days ending on `endDate`. */
function promptRunWindow(days: number, endDate?: string): { fromDate: Date; toDate: Date } {
	if (!endDate) {
		const toDate = new Date();
		const fromDate = new Date(toDate);
		fromDate.setDate(fromDate.getDate() - days);
		return { fromDate, toDate };
	}
	const toDate = new Date(`${endDate}T00:00:00Z`);
	toDate.setUTCDate(toDate.getUTCDate() + 1);
	const fromDate = new Date(toDate);
	fromDate.setUTCDate(fromDate.getUTCDate() - days);
	return { fromDate, toDate };
}

/**
 * Get stats for a single prompt (mentions, web queries, citations)
 * Replicates: apps/web/src/app/api/prompts/[promptId]/stats/route.ts
 */
export const getPromptStatsFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			promptId: z.string(),
			lookback: lookbackSchema.default("1w"),
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

		const { fromDate, toDate } = promptRunWindow(
			await resolveBrandLookbackDays(prompt[0].brandId, data.lookback),
			customRangeEnd(data.lookback),
		);
		// A rolling window, like the runs list beside it; the rollups answer it to the quarter hour.
		const scope = {
			brandId: prompt[0].brandId,
			from: bucketStart(fromDate).toISOString(),
			to: toDate.toISOString(),
			timezone: "UTC",
			promptIds: [data.promptId],
		};
		const [mentionTotals, competitorMentions, brandResult, allCompetitors] = await Promise.all([
			pgReader.getMentionTotals(scope),
			pgReader.getCompetitorTotals(scope),
			db.select({ name: brands.name }).from(brands).where(eq(brands.id, prompt[0].brandId)).limit(1),
			db.select({ name: competitors.name }).from(competitors).where(eq(competitors.brandId, prompt[0].brandId)),
		]);

		// ---- Process mention stats ----
		const mentionStats: { name: string; count: number }[] = [];

		const brandName = brandResult[0]?.name;
		if (brandName) {
			mentionStats.push({ name: brandName, count: mentionTotals.brand_mentioned_runs });
		}

		// Only current competitors, each listed once (two rows can share a name) even when no run named it.
		const mentionsByName = new Map(competitorMentions.map((row) => [row.competitor, row.runs]));
		for (const name of new Set(allCompetitors.map((c) => c.name))) {
			mentionStats.push({ name, count: mentionsByName.get(name) ?? 0 });
		}

		const noMentionCount = mentionTotals.no_mention_runs;
		if (noMentionCount > 0) {
			mentionStats.push({ name: "(no brand mentions)", count: noMentionCount });
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

		const urlStats = await pgReader.getCitationUrlStats(scope);

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
				totalRuns: mentionTotals.runs,
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
			lookback: lookbackSchema.default("1w"),
			sentiment: sentimentFilterSchema.optional(),
			sort: responseSortSchema.default("newest"),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();

		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, data.promptId),
		});
		if (!prompt) throw new Error("Prompt not found");

		await requireBrandAccess(session.user.id, prompt.brandId);

		const { fromDate, toDate } = promptRunWindow(
			await resolveBrandLookbackDays(prompt.brandId, data.lookback),
			customRangeEnd(data.lookback),
		);
		// The same read as the Responses page, over this prompt and the rolling window beside it.
		const scope: ResponseSearchScope = {
			brandId: prompt.brandId,
			from: fromDate.toISOString(),
			to: toDate.toISOString(),
			timezone: "UTC",
			promptIds: [data.promptId],
		};
		const offset = (data.page - 1) * data.limit;
		const [rows, sentimentFilterCounts] = await Promise.all([
			getResponseMatches({ ...scope, sentiment: data.sentiment }, data.limit, offset, data.sort),
			getResponseSentimentCounts(scope),
		]);
		const total = data.sentiment ? sentimentFilterCounts[data.sentiment] : sentimentFilterCounts.all;
		return {
			runs: rows.map(toResponse),
			total,
			/** Before the sentiment filter narrows them. */
			sentimentFilterCounts,
			page: data.page,
			limit: data.limit,
			hasMore: offset + rows.length < total,
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
			.select({ id: prompts.id, value: prompts.value, enabled: prompts.enabled, premiumModels: prompts.premiumModels })
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
			const retexted = updates.filter(({ id, prompt }) => existingById.get(id)?.value !== prompt.value);
			await markPromptRunsDirty(
				tx,
				data.brandId,
				retexted.map(({ id }) => id),
			);

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
			lookback: lookbackSchema.default("1m"),
			model: z.string().optional(),
			timezone: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		const timezone = resolveTimezone(data.timezone, "UTC");
		const range = getTimezoneLookbackRange(data.lookback, timezone);
		const toDateStr = range.toDateStr ?? new Date().toLocaleDateString("en-CA", { timeZone: timezone });
		const fromDateStr = range.fromDateStr;

		const webQueryData = await getPromptWebQueryCounts(
			data.brandId,
			data.promptId,
			fromDateStr,
			toDateStr,
			timezone,
			data.model,
		);

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
