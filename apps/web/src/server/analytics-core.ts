/**
 * The analytics the dashboard shows, computed once and callable from anywhere.
 *
 * These are edge-agnostic: no session, no Request, no auth. A caller passes a
 * brand it has already decided the requester may see, a resolved date window,
 * and the optional filters. That makes them usable from both a TanStack server
 * function (which resolves the requester from a session) and a `/api/v1` route
 * (which resolves it from an API key), so the two surfaces cannot compute
 * different numbers from the same data.
 *
 * The queries and the pure roll-up helpers are the dashboard's own — nothing
 * here reimplements a metric.
 */
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { rollUpCitationDomains, rollUpCitationUrls } from "@/lib/citation-rollup";
import type { LookbackPeriod } from "@/lib/chart-utils";
import { generateDateRange } from "@/lib/chart-utils";
import { classifyUrl as classifyUrlShared } from "@/lib/domain-categories.server";
import { extractDomain, normalizeUrl } from "@/lib/domain-categories";
import { computeFanoutAnalysis } from "@/lib/fanout-analysis";
import { getModelMeta } from "@workspace/config/models";
import {
	getBrandMentionRateByModel,
	getBrandMentionTotals,
	getCitationsTotalCount,
	getCitationUrlStats,
	getFanoutBreakdown,
	getFanoutModelTotals,
	getPerPromptDailyCompetitorMentions,
	getPerPromptDailyMentions,
	getPromptsFirstEvaluatedAt,
	getPromptsSummary,
	getVisibilityDailyAggregate,
} from "@/lib/postgres-read";
import { computeShareOfVoice, shareOfVoiceLeaderboardLVCF, shareOfVoiceTimeSeriesLVCF } from "@/lib/visibility-stats";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";

export interface AnalyticsWindow {
	startDate: string;
	endDate: string;
	timezone: string;
}

export interface AnalyticsFilters {
	model?: string;
	tags?: string;
	search?: string;
}

export interface VisibilityPoint {
	date: string;
	visibility: number | null;
}

export interface BrandVisibility {
	currentVisibility: number | null;
	totalRuns: number;
	totalPrompts: number;
	totalCitations: number;
	series: VisibilityPoint[];
}

/** The prompts in scope for a window, split into the branded/non-branded buckets the metrics need. */
async function resolveScope(brandId: string, filters: AnalyticsFilters) {
	const resolved = await resolveFilteredPrompts(brandId, { tags: filters.tags, search: filters.search });
	return {
		promptIds: resolved.map((prompt) => prompt.id),
		brandedPromptIds: resolved
			.filter((prompt) => getEffectiveBrandedStatus(prompt.systemTags, prompt.tags).isBranded)
			.map((prompt) => prompt.id),
		prompts: resolved,
	};
}

/**
 * Daily visibility plus the period totals beside it.
 *
 * Period run totals come from the raw observation sums; the plotted series uses
 * the per-day carried-forward sums, so a gap in one prompt's schedule doesn't
 * read as a dip. "Current" is the last plotted point, which is what the
 * dashboard's hero shows — not the window average.
 */
export async function getBrandVisibility(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<BrandVisibility> {
	const { promptIds, brandedPromptIds } = await resolveScope(brandId, filters);
	if (promptIds.length === 0) {
		return { currentVisibility: null, totalRuns: 0, totalPrompts: 0, totalCitations: 0, series: [] };
	}

	const { startDate, endDate, timezone } = window;
	const [daily, totalCitations] = await Promise.all([
		getVisibilityDailyAggregate(brandId, startDate, endDate, timezone, promptIds, brandedPromptIds, filters.model),
		getCitationsTotalCount(brandId, startDate, endDate, timezone, promptIds, filters.model),
	]);

	let totalRuns = 0;
	const series: VisibilityPoint[] = daily.map((row) => {
		totalRuns += row.actual_branded_runs + row.actual_nonbranded_runs;
		const plotted = row.lvcf_branded_runs + row.lvcf_nonbranded_runs;
		const mentioned = row.lvcf_branded_mentioned + row.lvcf_nonbranded_mentioned;
		return { date: row.date, visibility: plotted === 0 ? null : Math.round((mentioned / plotted) * 100) };
	});

	let currentVisibility: number | null = null;
	for (let i = series.length - 1; i >= 0; i--) {
		if (series[i].visibility != null) {
			currentVisibility = series[i].visibility;
			break;
		}
	}

	return { currentVisibility, totalRuns, totalPrompts: promptIds.length, totalCitations, series };
}

export interface ShareOfVoiceEntry {
	name: string;
	isBrand: boolean;
	mentions: number;
	prompts: number;
	share: number;
}

export interface BrandShareOfVoice {
	brandName: string;
	brandShare: number | null;
	totalRuns: number;
	entries: ShareOfVoiceEntry[];
	series: { date: string; share: number | null }[];
}

/**
 * The brand against its tracked competitors.
 *
 * Standings carry each prompt's latest counts forward to the last day, so the
 * headline and the final point of the trend are the same number rather than a
 * whole-window aggregate and a daily one.
 */
export async function getBrandShareOfVoice(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<BrandShareOfVoice> {
	const { startDate, endDate, timezone } = window;
	const [brandRow, scope] = await Promise.all([
		db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1),
		resolveScope(brandId, filters),
	]);
	const brandName = brandRow[0]?.name ?? "Your brand";
	if (scope.promptIds.length === 0) {
		return { brandName, brandShare: null, totalRuns: 0, entries: [], series: [] };
	}

	const dateRange = generateDateRange(new Date(startDate), new Date(endDate));
	const [totals, perPromptDaily, perPromptCompetitorDaily] = await Promise.all([
		getBrandMentionTotals(brandId, startDate, endDate, timezone, scope.promptIds, filters.model),
		getPerPromptDailyMentions(brandId, startDate, endDate, timezone, scope.promptIds, filters.model),
		getPerPromptDailyCompetitorMentions(brandId, startDate, endDate, timezone, scope.promptIds, filters.model),
	]);

	const standings = shareOfVoiceLeaderboardLVCF(
		perPromptDaily.map((row) => ({ promptId: row.prompt_id, date: String(row.date), brand: row.brand_mentions })),
		perPromptCompetitorDaily.map((row) => ({
			promptId: row.prompt_id,
			date: String(row.date),
			competitor: row.competitor,
			mentions: row.mentions,
		})),
		dateRange,
	);

	const promptsByName = new Map(standings.competitors.map((c) => [c.name, c.prompts]));
	const { entries, brandShare } = computeShareOfVoice(
		{ name: brandName, mentions: standings.brandMentions },
		standings.competitors.map((c) => ({ name: c.name, mentions: c.mentions })),
	);

	// The trend wants brand and competitor counts on one row per prompt/day; the
	// two queries return them separately, so fold the competitor totals in.
	const competitorsByPromptDay = new Map<string, number>();
	for (const row of perPromptCompetitorDaily) {
		const key = `${row.prompt_id}|${String(row.date)}`;
		competitorsByPromptDay.set(key, (competitorsByPromptDay.get(key) ?? 0) + Number(row.mentions));
	}
	const series = shareOfVoiceTimeSeriesLVCF(
		perPromptDaily.map((row) => ({
			promptId: row.prompt_id,
			date: String(row.date),
			brandMentions: Number(row.brand_mentions),
			competitorMentions: competitorsByPromptDay.get(`${row.prompt_id}|${String(row.date)}`) ?? 0,
		})),
		dateRange,
	);

	// computeShareOfVoice deliberately returns exact 0..1 ratios so the dashboard
	// can round once at the point of display. The wire is percentages, and this
	// is that point — round here, and only here, so the leaderboard and the
	// headline can never disagree by a point.
	const asPercent = (ratio: number) => Math.round(ratio * 100);

	return {
		brandName,
		brandShare: brandShare === null ? null : asPercent(brandShare),
		totalRuns: Number(totals?.total_runs ?? 0),
		entries: entries.map((entry) => ({
			name: entry.name,
			isBrand: entry.isBrand,
			mentions: entry.mentions,
			prompts: entry.isBrand ? standings.brandPrompts : (promptsByName.get(entry.name) ?? 0),
			share: asPercent(entry.share),
		})),
		series,
	};
}

export interface PlatformVisibility {
	model: string;
	label: string;
	runs: number;
	brandMentions: number;
	visibility: number | null;
	citations: number;
}

/** Where the brand is strong and where it is invisible, per answer engine. */
export async function getBrandPlatformBreakdown(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<PlatformVisibility[]> {
	const { promptIds } = await resolveScope(brandId, filters);
	if (promptIds.length === 0) return [];
	const { startDate, endDate, timezone } = window;

	const rows = await getBrandMentionRateByModel(brandId, startDate, endDate, timezone, promptIds);

	// One citation total per model, rather than the URL roll-up, which has no
	// model column to group by.
	const citationsByModel = new Map<string, number>();
	await Promise.all(
		rows.map(async (row) => {
			citationsByModel.set(
				row.model,
				await getCitationsTotalCount(brandId, startDate, endDate, timezone, promptIds, row.model),
			);
		}),
	);

	return rows.map((row) => {
		const runs = Number(row.runs);
		const mentions = Number(row.brand_mentioned_count);
		return {
			model: row.model,
			label: getModelMeta(row.model).label,
			runs,
			brandMentions: mentions,
			visibility: runs === 0 ? null : Math.round((mentions / runs) * 100),
			citations: citationsByModel.get(row.model) ?? 0,
		};
	});
}

export interface CitationTotals {
	citations: number;
	uniqueDomains: number;
	uniqueUrls: number;
}

async function citationContext(brandId: string) {
	const [brandRow, competitorRows] = await Promise.all([
		db.select().from(brands).where(eq(brands.id, brandId)).limit(1),
		db.select().from(competitors).where(eq(competitors.brandId, brandId)),
	]);
	const brand = brandRow[0];
	const brandDomains = new Set(
		[extractDomain(brand?.website ?? ""), ...(brand?.additionalDomains ?? []).map(extractDomain)].filter(Boolean),
	);
	const competitorDomains = new Set(
		competitorRows.flatMap((row) => row.domains.map(extractDomain)).filter(Boolean),
	);
	return { brandDomains, competitorDomains };
}

/**
 * Cited pages and the domains behind them, compared against the equal-length
 * window immediately before this one — which is what makes "new" and "changed"
 * mean anything.
 */
export async function getBrandCitations(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
) {
	const { promptIds } = await resolveScope(brandId, filters);
	const { startDate, endDate, timezone } = window;
	if (promptIds.length === 0) {
		return { urls: [], domains: [], totals: { citations: 0, uniqueDomains: 0, uniqueUrls: 0 } };
	}

	const spanDays = Math.max(
		1,
		Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1,
	);
	const previousEnd = new Date(new Date(startDate).getTime() - 86_400_000);
	const previousStart = new Date(previousEnd.getTime() - (spanDays - 1) * 86_400_000);
	const iso = (date: Date) => date.toISOString().slice(0, 10);

	const [{ brandDomains, competitorDomains }, current, previous] = await Promise.all([
		citationContext(brandId),
		getCitationUrlStats(brandId, startDate, endDate, timezone, promptIds, filters.model),
		getCitationUrlStats(brandId, iso(previousStart), iso(previousEnd), timezone, promptIds, filters.model),
	]);

	const classify = (domain: string, url: string, title?: string | null) =>
		classifyUrlShared(domain, url, title, brandDomains, competitorDomains);

	const previousUrls = new Set(previous.map((stat) => normalizeUrl(stat.url)));
	const previousDomainCounts = new Map<string, number>();
	for (const stat of previous) {
		previousDomainCounts.set(stat.domain, (previousDomainCounts.get(stat.domain) ?? 0) + Number(stat.count));
	}

	const promptCounts = new Map<string, number>();
	for (const stat of current) {
		const url = normalizeUrl(stat.url);
		promptCounts.set(url, Math.max(promptCounts.get(url) ?? 0, Number(stat.prompt_count)));
	}
	const promptsByDomain = new Map<string, number>();
	for (const stat of current) {
		promptsByDomain.set(stat.domain, Math.max(promptsByDomain.get(stat.domain) ?? 0, Number(stat.prompt_count)));
	}

	const rolled = rollUpCitationUrls(current, classify);
	const totalCitations = rolled.reduce((sum, row) => sum + row.count, 0);

	const urls = rolled.map((row) => ({
		url: row.url,
		domain: row.domain,
		title: row.title ?? null,
		category: row.category,
		pageType: row.pageType,
		count: row.count,
		promptCount: promptCounts.get(row.url) ?? 0,
		isNew: !previousUrls.has(row.url),
	}));

	const domains = rollUpCitationDomains(rolled).map((row) => {
		const previousCount = previousDomainCounts.get(row.domain) ?? 0;
		return {
			domain: row.domain,
			category: row.category,
			count: row.count,
			share: totalCitations === 0 ? 0 : Math.round((row.count / totalCitations) * 1000) / 10,
			promptCount: promptsByDomain.get(row.domain) ?? 0,
			previousCount,
			changePercent: previousCount > 0 ? Math.round(((row.count - previousCount) / previousCount) * 100) : null,
		};
	});

	return {
		urls,
		domains,
		totals: { citations: totalCitations, uniqueDomains: domains.length, uniqueUrls: urls.length },
	};
}

export interface FanoutQuery {
	query: string;
	runs: number;
	promptCount: number;
}

/**
 * The searches the engines ran while answering. Engines that don't expose their
 * searches still contribute runs, so `coverageRate` is measured against every
 * run rather than only the ones that searched.
 */
export async function getBrandQueryFanout(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
) {
	const scope = await resolveScope(brandId, filters);
	const { startDate, endDate, timezone } = window;
	const empty = {
		totalQueries: 0,
		uniqueQueries: 0,
		fanoutRuns: 0,
		totalRuns: 0,
		avgQueriesPerRun: 0,
		coverageRate: 0,
		queries: [] as FanoutQuery[],
	};
	if (scope.promptIds.length === 0) return empty;

	const [breakdown, modelTotals] = await Promise.all([
		getFanoutBreakdown(brandId, startDate, endDate, timezone, scope.promptIds, filters.model),
		getFanoutModelTotals(brandId, startDate, endDate, timezone, scope.promptIds, filters.model),
	]);

	const promptValues = new Map(scope.prompts.map((prompt) => [prompt.id, prompt.value]));
	const analysis = computeFanoutAnalysis(breakdown, modelTotals, promptValues, {
		// The API pages its own list, so the display caps the dashboard applies
		// would silently truncate it.
		limits: { breadth: Number.MAX_SAFE_INTEGER },
	});

	return {
		totalQueries: analysis.totalQueries,
		uniqueQueries: analysis.uniqueQueries,
		fanoutRuns: analysis.fanoutRuns,
		totalRuns: analysis.totalRuns,
		avgQueriesPerRun: analysis.avgPerExecution,
		coverageRate: analysis.coverageRate,
		// topByRuns already carries both figures per query, which is what a caller
		// paging this list wants; topQueries carries only an instance count.
		queries: analysis.topByRuns.map((entry) => ({
			query: entry.query,
			runs: entry.runs,
			promptCount: entry.prompts,
		})),
	};
}

export interface PromptPerformance {
	promptId: string;
	value: string;
	enabled: boolean;
	tags: string[];
	totalRuns: number;
	brandMentionRate: number;
	competitorMentionRate: number;
	lastRunAt: string | null;
	firstEvaluatedAt: string | null;
}

/** Per-prompt results over the window — the analytics counterpart to listing prompts. */
export async function getBrandPromptPerformance(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<PromptPerformance[]> {
	const scope = await resolveScope(brandId, filters);
	if (scope.promptIds.length === 0) return [];
	const { startDate, endDate, timezone } = window;

	const [summary, firstEvaluated] = await Promise.all([
		getPromptsSummary(brandId, startDate, endDate, timezone, undefined, filters.model, scope.promptIds),
		getPromptsFirstEvaluatedAt(brandId, scope.promptIds),
	]);

	const statsById = new Map(summary.map((row) => [row.prompt_id, row]));
	const firstById = new Map(firstEvaluated.map((row) => [row.prompt_id, row.first_evaluated_at]));

	return scope.prompts.map((prompt) => {
		const stats = statsById.get(prompt.id);
		const first = firstById.get(prompt.id);
		return {
			promptId: prompt.id,
			value: prompt.value,
			enabled: true,
			tags: prompt.tags ?? [],
			totalRuns: Number(stats?.total_runs ?? 0),
			brandMentionRate: Math.round(Number(stats?.brand_mention_rate ?? 0)),
			competitorMentionRate: Math.round(Number(stats?.competitor_mention_rate ?? 0)),
			lastRunAt: stats?.last_run_date ? new Date(stats.last_run_date).toISOString() : null,
			firstEvaluatedAt: first ? new Date(first).toISOString() : null,
		};
	});
}

/** Every headline figure the dashboard shows for a brand, in one request. */
export async function getBrandSummary(brandId: string, window: AnalyticsWindow, filters: AnalyticsFilters = {}) {
	const [visibility, shareOfVoice, platforms, citations] = await Promise.all([
		getBrandVisibility(brandId, window, filters),
		getBrandShareOfVoice(brandId, window, filters),
		getBrandPlatformBreakdown(brandId, window, filters),
		getBrandCitations(brandId, window, filters),
	]);

	return {
		brandName: shareOfVoice.brandName,
		visibility: visibility.currentVisibility,
		shareOfVoice: shareOfVoice.brandShare,
		totalRuns: visibility.totalRuns,
		totalPrompts: visibility.totalPrompts,
		totalCitations: visibility.totalCitations,
		uniqueDomains: citations.totals.uniqueDomains,
		platforms: platforms.map((platform) => platform.model),
	};
}

export type { LookbackPeriod };
