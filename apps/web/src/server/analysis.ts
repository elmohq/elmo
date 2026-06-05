/**
 * Server functions for AI-visibility analysis: Share of Voice and per-prompt
 * Opportunities. Read-only — derived entirely from existing prompt_runs /
 * citations data via the postgres read layer plus the pure stats in
 * `@/lib/visibility-stats`. No schema changes.
 *
 * Filters are resolved server-side (tags/search -> prompt IDs) via
 * `resolveFilteredPrompts`, and the lookback window is computed in the user's
 * timezone — the same handling as the visibility page (see issue #68), so we
 * never serialize a brand's full prompt-id list into the request URL.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import {
	getPerPromptRunStats,
	getPerPromptDailyCitationStats,
	getBrandMentionTotals,
	getPerPromptDailyMentions,
	getPerPromptDailyCompetitorMentions,
	type PerPromptDailyCitationStats,
} from "@/lib/postgres-read";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";
import { isBrandedPrompt } from "@/lib/prompt-tags";
import { generateDateRange, type LookbackPeriod } from "@/lib/chart-utils";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";
import {
	computeVolatility,
	stabilityScore,
	computeShareOfVoice,
	computeOpportunity,
	shareOfVoiceTimeSeriesLVCF,
	shareOfVoiceLeaderboardLVCF,
	type DailyDomainCount,
	type OpportunityTier,
} from "@/lib/visibility-stats";

const LOOKBACK = z.enum(["1w", "1m", "3m", "6m", "1y", "all"]);

/** Resolve a lookback + timezone into concrete from/to date strings (mirrors server/visibility.ts). */
function resolveRange(lookback: LookbackPeriod, timezoneParam: string) {
	const timezone = resolveTimezone(timezoneParam);
	const { fromDateStr, toDateStr } = getTimezoneLookbackRange(lookback, timezone, { allStrategy: "1y" }) as {
		fromDateStr: string;
		toDateStr: string;
	};
	return { timezone, fromDateStr, toDateStr };
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
			lookback: LOOKBACK.default("1m"),
			model: z.string().optional(),
			tags: z.string().optional(),
			search: z.string().optional(),
			timezone: z.string().default("UTC"),
			limit: z.number().optional().default(40),
		}),
	)
	.handler(async ({ data }): Promise<ShareOfVoiceResponse> => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const { timezone, fromDateStr, toDateStr } = resolveRange(data.lookback as LookbackPeriod, data.timezone);

		const [brandRow, resolved] = await Promise.all([
			db.select({ name: brands.name }).from(brands).where(eq(brands.id, data.brandId)).limit(1),
			resolveFilteredPrompts(data.brandId, { tags: data.tags, search: data.search }),
		]);
		const brandName = brandRow[0]?.name ?? "Your brand";
		const promptIds = resolved.map((p) => p.id);

		if (promptIds.length === 0) {
			return { brandName, entries: [], brandShare: null, totalRuns: 0, model: data.model ?? null, shareTimeSeries: [] };
		}

		const dateRange = generateDateRange(new Date(fromDateStr), new Date(toDateStr));
		const [totals, perPromptDaily, perPromptCompetitorDaily] = await Promise.all([
			getBrandMentionTotals(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model),
			getPerPromptDailyMentions(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model),
			getPerPromptDailyCompetitorMentions(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model),
		]);

		// "Current standings": carry each prompt's latest brand + per-competitor counts
		// forward to the last day, so the headline, donut, and leaderboard reflect the
		// same state as the trend's final point rather than a whole-window aggregate.
		const standings = shareOfVoiceLeaderboardLVCF(
			perPromptDaily.map((r) => ({ promptId: r.prompt_id, date: String(r.date), brand: r.brand_mentions })),
			perPromptCompetitorDaily.map((r) => ({
				promptId: r.prompt_id,
				date: String(r.date),
				competitor: r.competitor,
				mentions: r.mentions,
			})),
			dateRange,
		);

		const promptsByName = new Map(standings.competitors.map((c) => [c.name, c.prompts]));
		const { entries, brandShare } = computeShareOfVoice(
			{ name: brandName, mentions: standings.brandMentions },
			standings.competitors.map((c) => ({ name: c.name, mentions: c.mentions })),
		);

		// Same per-prompt LVCF as the standings above, per day — so the line's final
		// point equals the headline brandShare.
		const shareTimeSeries = shareOfVoiceTimeSeriesLVCF(
			perPromptDaily.map((r) => ({
				promptId: r.prompt_id,
				date: String(r.date),
				brandMentions: r.brand_mentions,
				competitorMentions: r.competitor_mentions,
			})),
			dateRange,
		);

		return {
			brandName,
			brandShare,
			totalRuns: totals.total_runs,
			model: data.model ?? null,
			shareTimeSeries,
			entries: entries.map((e) => ({
				...e,
				prompts: e.isBrand ? standings.brandPrompts : (promptsByName.get(e.name) ?? 0),
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
			lookback: LOOKBACK.default("1m"),
			model: z.string().optional(),
			tags: z.string().optional(),
			search: z.string().optional(),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<PromptOpportunitiesResponse> => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const { timezone, fromDateStr, toDateStr } = resolveRange(data.lookback as LookbackPeriod, data.timezone);

		// Opportunities are about competitive prompts — exclude the brand's own
		// branded queries from the tag/search-resolved set.
		const consideredPrompts = (await resolveFilteredPrompts(data.brandId, { tags: data.tags, search: data.search })).filter(
			(p) => !isBrandedPrompt(p),
		);
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
