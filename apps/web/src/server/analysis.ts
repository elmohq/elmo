/**
 * Server functions for AI-visibility analysis: Share of Voice and per-prompt
 * Opportunities (winnability). Read-only — derived entirely from existing
 * prompt_runs / citations data via the postgres read layer plus the pure
 * stats in `@/lib/visibility-stats`. No schema changes.
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
	type PerPromptDailyCitationStats,
} from "@/lib/postgres-read";
import {
	computeVolatility,
	computeConcentration,
	citationCoverage,
	groundingMode,
	stabilityScore,
	computeShareOfVoice,
	computeWinnability,
	type DailyDomainCount,
	type GroundingMode,
	type WinnabilityTier,
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

// ============================================================================
// Share of Voice
// ============================================================================

export interface ShareOfVoiceEntry {
	name: string;
	mentions: number;
	share: number;
	isBrand: boolean;
	/** Distinct prompts the entity appeared in (null for the brand row). */
	prompts: number | null;
}

export interface ShareOfVoiceResponse {
	brandName: string;
	entries: ShareOfVoiceEntry[];
	brandShare: number | null;
	totalRuns: number;
	model: string | null;
}

export const getShareOfVoiceFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			days: z.number().optional().default(30),
			model: z.string().optional(),
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
				.select({ id: prompts.id })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
		]);
		const brandName = brandRow[0]?.name ?? "Your brand";
		const promptIds = enabledPrompts.map((p) => p.id);

		if (promptIds.length === 0) {
			return { brandName, entries: [], brandShare: null, totalRuns: 0, model: data.model ?? null };
		}

		const [totals, leaderboard] = await Promise.all([
			getBrandMentionTotals(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model),
			getCompetitorMentionLeaderboard(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model, data.limit),
		]);

		const promptsByCompetitor = new Map(leaderboard.map((c) => [c.competitor, c.prompts]));
		const { entries, brandShare } = computeShareOfVoice(
			{ name: brandName, mentions: totals.brand_mentioned_runs },
			leaderboard.map((c) => ({ name: c.competitor, mentions: c.mentions })),
		);

		return {
			brandName,
			brandShare,
			totalRuns: totals.total_runs,
			model: data.model ?? null,
			entries: entries.map((e) => ({
				...e,
				prompts: e.isBrand ? null : (promptsByCompetitor.get(e.name) ?? 0),
			})),
		};
	});

// ============================================================================
// Per-Prompt Opportunities (winnability)
// ============================================================================

export interface PromptOpportunity {
	promptId: string;
	prompt: string;
	runs: number;
	brandMentionRate: number;
	competitorMentionRate: number;
	coverage: number | null;
	groundingMode: GroundingMode;
	setVolatility: number | null;
	weightedVolatility: number | null;
	stabilityScore: number | null;
	coreShareOfCitations: number | null;
	dayTransitions: number;
	winnability: number;
	tier: WinnabilityTier;
	play: "citation" | "mention";
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
		}),
	)
	.handler(async ({ data }): Promise<PromptOpportunitiesResponse> => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const { fromDateStr, toDateStr, timezone } = dateRangeFromDays(data.days);

		const enabledPrompts = await db
			.select({ id: prompts.id, value: prompts.value })
			.from(prompts)
			.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true)));
		const promptIds = enabledPrompts.map((p) => p.id);

		if (promptIds.length === 0) {
			return { prompts: [], model: data.model ?? null };
		}

		const [runStats, dailyCitations] = await Promise.all([
			getPerPromptRunStats(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model),
			getPerPromptDailyCitationStats(data.brandId, fromDateStr, toDateStr, timezone, promptIds, data.model),
		]);

		const runStatsByPrompt = new Map(runStats.map((r) => [r.prompt_id, r]));
		const dailyByPrompt = groupDailyByPrompt(dailyCitations);

		const results: PromptOpportunity[] = enabledPrompts.map((p) => {
			const daily = dailyByPrompt.get(p.id) ?? [];
			const run = runStatsByPrompt.get(p.id);
			const runDays = run?.run_days ?? 0;
			const brandMentionRate = run?.brand_mention_rate ?? 0;
			const competitorMentionRate = run?.competitor_mention_rate ?? 0;

			const volatility = computeVolatility(daily);
			const concentration = computeConcentration(daily);
			const citedDays = new Set(daily.map((d) => d.date)).size;
			const coverage = citationCoverage(runDays, citedDays);
			const winnability = computeWinnability({
				brandPresence: brandMentionRate,
				competitorPresence: competitorMentionRate,
				coverage,
				volatility: volatility.weightedVolatility,
			});

			return {
				promptId: p.id,
				prompt: p.value,
				runs: run?.runs ?? 0,
				brandMentionRate,
				competitorMentionRate,
				coverage,
				groundingMode: groundingMode(coverage),
				setVolatility: volatility.setVolatility,
				weightedVolatility: volatility.weightedVolatility,
				stabilityScore: stabilityScore(volatility.weightedVolatility),
				coreShareOfCitations: concentration.coreShareOfCitations,
				dayTransitions: volatility.dayTransitions,
				winnability: winnability.score,
				tier: winnability.tier,
				play: winnability.play,
			};
		});

		results.sort((a, b) => b.winnability - a.winnability);
		return { prompts: results, model: data.model ?? null };
	});
