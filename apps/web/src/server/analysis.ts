/**
 * Server functions for AI-visibility analysis: Share of Voice and per-prompt
 * Opportunities. Read-only — derived entirely from existing prompt_runs /
 * citations data via the postgres read layer plus the pure stats in
 * `@/lib/visibility-stats`. No schema changes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
	getPerPromptRunStats,
	getPerPromptDailyCitationStats,
	getBrandMentionTotals,
	getCompetitorMentionLeaderboard,
	getDailyShareOfVoice,
	type PerPromptDailyCitationStats,
} from "@/lib/postgres-read";
import { filterPromptIdsByTags, isBrandedPrompt } from "@/lib/prompt-tags";
import { generateDateRange } from "@/lib/chart-utils";
import {
	computeVolatility,
	stabilityScore,
	computeShareOfVoice,
	computeOpportunity,
	type DailyDomainCount,
	type OpportunityTier,
} from "@/lib/visibility-stats";

/** Resolve a `days` lookback into UTC from/to date strings (mirrors server/citations.ts). */
function dateRangeFromDays(days: number): { fromDateStr: string; toDateStr: string; timezone: string } {
	const toDate = new Date();
	const fromDate = new Date();
	fromDate.setDate(fromDate.getDate() - days);
	return {
		fromDateStr: fromDate.toISOString().split("T")[0],
		toDateStr: toDate.toISOString().split("T")[0],
		timezone: "UTC",
	};
}

/** Group per-prompt daily citation rows into the {date, domain, count}[] shape the stats expect. */
function groupDailyByPrompt(rows: PerPromptDailyCitationStats[]): Map<string, DailyDomainCount[]> {
	const byPrompt = new Map<string, DailyDomainCount[]>();
	for (const row of rows) {
		let list = byPrompt.get(row.prompt_id);
		if (!list) {
			list = [];
			byPrompt.set(row.prompt_id, list);
		}
		list.push({ date: String(row.date), domain: row.domain, count: Number(row.count) });
	}
	return byPrompt;
}

const tagsArray = (tags?: string) => tags?.split(",").filter(Boolean) ?? [];

// ============================================================================
// Share of Voice
// ============================================================================

export interface ShareOfVoiceEntry {
	name: string;
	mentions: number;
	share: number;
	isBrand: boolean;
	/** Distinct prompts the entity appeared in. */
	prompts: number;
}

export interface ShareOfVoiceResponse {
	brandName: string;
	entries: ShareOfVoiceEntry[];
	brandShare: number | null;
	totalRuns: number;
	model: string | null;
	/** Brand share of voice over time (percentage 0..100, null on days with no runs). */
	shareTimeSeries: Array<{ date: string; share: number | null }>;
}

export const getShareOfVoiceFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			days: z.number().optional().default(30),
			model: z.string().optional(),
			tags: z.string().optional(),
			limit: z.number().optional().default(40),
		}),
	)
	.handler(async ({ data }): Promise<ShareOfVoiceResponse> => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const { fromDateStr, toDateStr, timezone } = dateRangeFromDays(data.days);

		const [brandRow, enabledPrompts] = await Promise.all([
			db.select({ name: brands.name }).from(brands).where(eq(brands.id, data.brandId)).limit(1),
			db
				.select({ id: prompts.id, tags: prompts.tags, systemTags: prompts.systemTags })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
		]);
		const brandName = brandRow[0]?.name ?? "Your brand";
		const promptIds = filterPromptIdsByTags(enabledPrompts, tagsArray(data.tags));

		if (promptIds.length === 0) {
			return {
				brandName,
				entries: [],
				brandShare: null,
				totalRuns: 0,
				model: data.model ?? null,
				shareTimeSeries: [],
			};
		}

		const [totals, leaderboard, daily] = await Promise.all([
			getBrandMentionTotals(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model),
			getCompetitorMentionLeaderboard(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model, data.limit),
			getDailyShareOfVoice(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model),
		]);

		const promptsByCompetitor = new Map(leaderboard.map((c) => [c.competitor, c.prompts]));
		const { entries, brandShare } = computeShareOfVoice(
			{ name: brandName, mentions: totals.brand_mentioned_runs },
			leaderboard.map((c) => ({ name: c.competitor, mentions: c.mentions })),
		);

		// Brand share of voice per day, over the lookback window.
		const dailyByDate = new Map(daily.map((d) => [d.date, d]));
		const start = new Date(toDateStr);
		start.setDate(start.getDate() - (data.days - 1));
		const shareTimeSeries = generateDateRange(start, new Date(toDateStr)).map((date) => {
			const d = dailyByDate.get(date);
			if (!d) return { date, share: null };
			const denom = d.brand_runs + d.competitor_mentions;
			return { date, share: denom === 0 ? null : Math.round((d.brand_runs / denom) * 100) };
		});

		return {
			brandName,
			brandShare,
			totalRuns: totals.total_runs,
			model: data.model ?? null,
			shareTimeSeries,
			entries: entries.map((e) => ({
				...e,
				prompts: e.isBrand ? totals.brand_mentioned_prompts : (promptsByCompetitor.get(e.name) ?? 0),
			})),
		};
	});

// ============================================================================
// Per-Prompt Opportunities
// ============================================================================

export interface PromptOpportunity {
	promptId: string;
	prompt: string;
	runs: number;
	brandMentionRate: number;
	competitorMentionRate: number;
	weightedVolatility: number | null;
	stabilityScore: number | null;
	dayTransitions: number;
	/** 0..1 opportunity score (the competitor-vs-you gap; 0 when won or not a brand query). */
	opportunity: number;
	tier: OpportunityTier;
}

export interface PromptOpportunitiesResponse {
	prompts: PromptOpportunity[];
	model: string | null;
}

export const getPromptOpportunitiesFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			days: z.number().optional().default(42),
			model: z.string().optional(),
			tags: z.string().optional(),
		}),
	)
	.handler(async ({ data }): Promise<PromptOpportunitiesResponse> => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const { fromDateStr, toDateStr, timezone } = dateRangeFromDays(data.days);

		const enabledPrompts = await db
			.select({ id: prompts.id, value: prompts.value, tags: prompts.tags, systemTags: prompts.systemTags })
			.from(prompts)
			.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true)));

		// Opportunities are about competitive prompts — exclude the brand's own
		// branded queries, then apply the tag filter.
		const nonBranded = enabledPrompts.filter((p) => !isBrandedPrompt(p));
		const allowedIds = new Set(filterPromptIdsByTags(nonBranded, tagsArray(data.tags)));
		const consideredPrompts = nonBranded.filter((p) => allowedIds.has(p.id));
		const promptIds = consideredPrompts.map((p) => p.id);

		if (promptIds.length === 0) {
			return { prompts: [], model: data.model ?? null };
		}

		const [runStats, dailyCitations] = await Promise.all([
			getPerPromptRunStats(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model),
			getPerPromptDailyCitationStats(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model),
		]);

		const runStatsByPrompt = new Map(runStats.map((r) => [r.prompt_id, r]));
		const dailyByPrompt = groupDailyByPrompt(dailyCitations);

		const results: PromptOpportunity[] = consideredPrompts.map((p) => {
			const daily = dailyByPrompt.get(p.id) ?? [];
			const run = runStatsByPrompt.get(p.id);
			const brandMentionRate = run?.brand_mention_rate ?? 0;
			const competitorMentionRate = run?.competitor_mention_rate ?? 0;

			const volatility = computeVolatility(daily);
			const opportunity = computeOpportunity({
				brandPresence: brandMentionRate,
				competitorPresence: competitorMentionRate,
			});

			return {
				promptId: p.id,
				prompt: p.value,
				runs: run?.runs ?? 0,
				brandMentionRate,
				competitorMentionRate,
				weightedVolatility: volatility.weightedVolatility,
				stabilityScore: stabilityScore(volatility.weightedVolatility),
				dayTransitions: volatility.dayTransitions,
				opportunity: opportunity.score,
				tier: opportunity.tier,
			};
		});

		results.sort((a, b) => b.opportunity - a.opportunity);
		return { prompts: results, model: data.model ?? null };
	});
