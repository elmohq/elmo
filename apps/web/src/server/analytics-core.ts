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

import { getModelMeta } from "@workspace/config/models";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { eq } from "drizzle-orm";
import { generateDateRange } from "@/lib/chart-utils";
import { rollUpCitationDomains, rollUpCitationUrls } from "@/lib/citation-rollup";
import { extractDomain, normalizeUrl } from "@/lib/domain-categories";
import { classifyUrl as classifyUrlShared } from "@/lib/domain-categories.server";
import { computeFanoutAnalysis, type FanoutAnalysis, type FanoutLimitOverrides } from "@/lib/fanout-analysis";
import {
	getBrandMentionRateByModel,
	getBrandMentionTotals,
	getCitationDomainPromptCounts,
	getCitationsTotalCount,
	getCitationUrlStats,
	getFanoutBreakdown,
	getFanoutModelTotals,
	getFanoutPromptTotals,
	getPerPromptDailyCompetitorMentions,
	getPerPromptDailyMentions,
	getPromptsFirstEvaluatedAt,
	getPromptsSummary,
	getVisibilityDailyAggregate,
	isCalendarDay,
} from "@/lib/postgres-read";
import { computeShareOfVoice, shareOfVoiceLeaderboardLVCF, shareOfVoiceTimeSeriesLVCF } from "@/lib/visibility-stats";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

export interface AnalyticsWindow {
	/**
	 * The window's bounds, in one of two spellings. The dashboard passes
	 * calendar days (`YYYY-MM-DD`, read in `timezone`, `to` covering the whole
	 * of its last day); `/api/v1` passes ISO 8601 instants and `to` is
	 * exclusive. `postgres-read` resolves both to the same half-open SQL bound,
	 * and `windowInstants` below matches it for instants — see its note for the
	 * calendar-day spelling, which no caller here passes.
	 */
	from: string;
	to: string;
	/** The zone the daily buckets are labelled in. */
	timezone: string;
}

/**
 * The window as absolute instants, `[start, end)`, whichever spelling built it.
 *
 * For instants this is exactly what `postgres-read` resolves for SQL. For
 * calendar days it is not: here a bare `YYYY-MM-DD` is midnight UTC, while
 * `postgres-read` resolves it in the caller's `timezone` — so the derived
 * bounds can sit a zone offset away from the rows the queries returned.
 *
 * Which matters only where the bounds become a *window*. The citations
 * comparison window below is one, and instants are all that reach it. Share of
 * voice is not: it turns these into day labels through `generateDateRange`,
 * which reads UTC day parts, so a calendar day goes in and the same day comes
 * back out. Mirror `windowStart`/`windowEnd` here before a calendar-day caller
 * needs a window rather than a label.
 */
function windowInstants(window: AnalyticsWindow): { start: Date; end: Date } {
	const start = new Date(isCalendarDay(window.from) ? `${window.from}T00:00:00Z` : window.from);
	const end = isCalendarDay(window.to)
		? new Date(new Date(`${window.to}T00:00:00Z`).getTime() + 86_400_000)
		: new Date(window.to);
	return { start, end };
}

export interface AnalyticsFilters {
	model?: string;
	tags?: string;
	search?: string;
}

interface VisibilityPoint {
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

	const { from, to, timezone } = window;
	const [daily, totalCitations] = await Promise.all([
		getVisibilityDailyAggregate(brandId, from, to, timezone, promptIds, brandedPromptIds, filters.model),
		getCitationsTotalCount(brandId, from, to, timezone, promptIds, filters.model),
	]);

	let totalRuns = 0;
	const series: VisibilityPoint[] = daily.map((row) => {
		totalRuns += row.actual_branded_runs + row.actual_nonbranded_runs;
		const plotted = row.lvcf_branded_runs + row.lvcf_nonbranded_runs;
		const mentioned = row.lvcf_branded_mentioned + row.lvcf_nonbranded_mentioned;
		return { date: row.date, visibility: plotted === 0 ? null : mentioned / plotted };
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

interface ShareOfVoiceEntry {
	name: string;
	isBrand: boolean;
	mentions: number;
	prompts: number;
	/** Exact ratio 0..1. Each edge rounds once, on the way out. */
	share: number;
}

export interface BrandShareOfVoice {
	brandName: string;
	/** Exact ratio 0..1, or null when nothing was mentioned. */
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
	const { from, to, timezone } = window;
	const [brandRow, scope] = await Promise.all([
		db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1),
		resolveScope(brandId, filters),
	]);
	const brandName = brandRow[0]?.name ?? "Your brand";
	if (scope.promptIds.length === 0) {
		return { brandName, brandShare: null, totalRuns: 0, entries: [], series: [] };
	}

	const bounds = windowInstants(window);
	const dateRange = generateDateRange(bounds.start, new Date(bounds.end.getTime() - 1));
	const [totals, perPromptDaily, perPromptCompetitorDaily] = await Promise.all([
		getBrandMentionTotals(brandId, from, to, timezone, scope.promptIds, filters.model),
		getPerPromptDailyMentions(brandId, from, to, timezone, scope.promptIds, filters.model),
		getPerPromptDailyCompetitorMentions(brandId, from, to, timezone, scope.promptIds, filters.model),
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

	// The same per-prompt carry-forward as the standings above, per day — so the
	// line's final point equals the headline share. The competitor total comes
	// off this row rather than from summing the per-competitor query, which
	// counts mention *instances* and would not agree with it.
	const series = shareOfVoiceTimeSeriesLVCF(
		perPromptDaily.map((row) => ({
			promptId: row.prompt_id,
			date: String(row.date),
			brandMentions: row.brand_mentions,
			competitorMentions: row.competitor_mentions,
		})),
		dateRange,
	);

	// `share` and `brandShare` stay exact 0..1 ratios. Every rate this module
	// produces is one: the API publishes ratios directly, and the dashboard's
	// server functions turn them into percentages at their own edge. Rounding to
	// a percentage here would double-round for whichever surface rounds again.
	return {
		brandName,
		brandShare,
		totalRuns: Number(totals?.total_runs ?? 0),
		entries: entries.map((entry) => ({
			name: entry.name,
			isBrand: entry.isBrand,
			mentions: entry.mentions,
			prompts: entry.isBrand ? standings.brandPrompts : (promptsByName.get(entry.name) ?? 0),
			share: entry.share,
		})),
		series,
	};
}

export interface ModelVisibility {
	model: string;
	label: string;
	runs: number;
	brandMentions: number;
	visibility: number | null;
	citations: number;
}

/** Where the brand is strong and where it is invisible, per answer engine. */
export async function getBrandModelBreakdown(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<ModelVisibility[]> {
	const { promptIds } = await resolveScope(brandId, filters);
	if (promptIds.length === 0) return [];
	const { from, to, timezone } = window;

	const rows = await getBrandMentionRateByModel(brandId, from, to, timezone, promptIds, filters.model);

	// One citation total per model, rather than the URL roll-up, which has no
	// model column to group by.
	const citationsByModel = new Map<string, number>();
	await Promise.all(
		rows.map(async (row) => {
			citationsByModel.set(row.model, await getCitationsTotalCount(brandId, from, to, timezone, promptIds, row.model));
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
			visibility: runs === 0 ? null : mentions / runs,
			citations: citationsByModel.get(row.model) ?? 0,
		};
	});
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
	const competitorDomains = new Set(competitorRows.flatMap((row) => row.domains.map(extractDomain)).filter(Boolean));
	return { brandDomains, competitorDomains };
}

/**
 * Cited pages and the domains behind them, compared against the equal-length
 * window immediately before this one — which is what makes "new" and "changed"
 * mean anything.
 */
export async function getBrandCitations(brandId: string, window: AnalyticsWindow, filters: AnalyticsFilters = {}) {
	const { promptIds } = await resolveScope(brandId, filters);
	const { from, to, timezone } = window;
	if (promptIds.length === 0) {
		return { urls: [], domains: [], totals: { citations: 0, uniqueDomains: 0, uniqueUrls: 0 } };
	}

	// The comparison window is the same length, ending where this one begins.
	// Expressed as instants so it lands exactly there whichever spelling the
	// caller used, rather than rounding outward to whole days.
	const { start, end } = windowInstants(window);
	const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime())).toISOString();
	const previousEnd = start.toISOString();

	const [{ brandDomains, competitorDomains }, current, previous, promptsByDomain] = await Promise.all([
		citationContext(brandId),
		getCitationUrlStats(brandId, from, to, timezone, promptIds, filters.model),
		getCitationUrlStats(brandId, previousStart, previousEnd, timezone, promptIds, filters.model),
		getCitationDomainPromptCounts(brandId, from, to, timezone, promptIds, filters.model),
	]);

	const classify = (domain: string, url: string, title?: string | null) =>
		classifyUrlShared(domain, url, title, brandDomains, competitorDomains);

	const previousUrls = new Set(previous.map((stat) => normalizeUrl(stat.url)));
	const previousDomainCounts = new Map<string, number>();
	for (const stat of previous) {
		previousDomainCounts.set(stat.domain, (previousDomainCounts.get(stat.domain) ?? 0) + Number(stat.count));
	}

	// Per URL the largest count is the right one — the rows folded into a single
	// normalized URL describe the same page. A domain is different: its URLs can
	// be cited by disjoint prompts, so the distinct count has to come from the
	// database rather than from the largest of its parts.
	const promptCounts = new Map<string, number>();
	for (const stat of current) {
		const url = normalizeUrl(stat.url);
		promptCounts.set(url, Math.max(promptCounts.get(url) ?? 0, Number(stat.prompt_count)));
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
			share: totalCitations === 0 ? 0 : row.count / totalCitations,
			promptCount: promptsByDomain.get(row.domain) ?? 0,
			previousCount,
			changeFactor: previousCount > 0 ? row.count / previousCount : null,
		};
	});

	return {
		urls,
		domains,
		totals: { citations: totalCitations, uniqueDomains: domains.length, uniqueUrls: urls.length },
	};
}

/**
 * The searches the engines ran while answering.
 *
 * Returns the whole analysis rather than a slice of it: the dashboard renders
 * terms, word changes, and the per-model and per-prompt breakdowns, and the API
 * narrows to the list it publishes. One computation, two views.
 */
export async function getBrandQueryFanout(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
	options: {
		/** Scope to a single prompt — the prompt-details drill-down. */
		promptId?: string;
		/** Skip the display caps, for a caller that pages the lists itself. */
		uncapped?: boolean;
	} = {},
): Promise<FanoutAnalysis & { brandName: string }> {
	const { from, to, timezone } = window;
	const [brandRow, scope] = await Promise.all([
		db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1),
		resolveScope(brandId, filters),
	]);
	const brandName = brandRow[0]?.name ?? "Your brand";

	// Scoping to one prompt is the prompt-details drill-down; the lists come back
	// uncapped there because there is only one prompt's worth of them.
	const promptIds = options.promptId ? scope.promptIds.filter((id) => id === options.promptId) : scope.promptIds;
	if (promptIds.length === 0) return { brandName, ...emptyFanout() };

	const [breakdown, modelTotals, promptTotals] = await Promise.all([
		getFanoutBreakdown(brandId, from, to, timezone, promptIds, filters.model),
		getFanoutModelTotals(brandId, from, to, timezone, promptIds, filters.model),
		getFanoutPromptTotals(brandId, from, to, timezone, promptIds, filters.model),
	]);

	const promptValues = new Map(
		scope.prompts.filter((prompt) => promptIds.includes(prompt.id)).map((prompt) => [prompt.id, prompt.value]),
	);
	// Runs per prompt is what turns a query count into a rate. Without it every
	// byPrompt row reports zero runs and an average of zero.
	const promptRuns = new Map(promptTotals.map((row) => [row.prompt_id, row.runs]));

	return {
		brandName,
		...computeFanoutAnalysis(breakdown, modelTotals, promptValues, {
			promptRuns,
			limits: fanoutLimits(options),
		}),
	};
}

/**
 * The dashboard's caps are display caps. One prompt's worth of lists is small
 * enough to show whole; a caller that pages a list itself would otherwise page
 * a silently truncated one.
 */
function fanoutLimits(options: { promptId?: string; uncapped?: boolean }): FanoutLimitOverrides | undefined {
	if (options.uncapped) {
		return { topQueries: UNCAPPED, breadth: UNCAPPED, terms: UNCAPPED, perModelTop: UNCAPPED, variations: UNCAPPED };
	}
	// A payload-size backstop, far above the largest observed prompt (~700).
	if (options.promptId) return { topQueries: 2000, perModelTop: 2000, variations: 2000 };
	return undefined;
}

/** Effectively no cap, for a caller that pages the list itself. */
const UNCAPPED = Number.MAX_SAFE_INTEGER;

function emptyFanout(): FanoutAnalysis {
	return {
		totalQueries: 0,
		uniqueQueries: 0,
		fanoutRuns: 0,
		totalRuns: 0,
		avgPerExecution: 0,
		coverageRate: 0,
		topQueries: [],
		terms: [],
		wordChanges: { added: [], dropped: [], preserved: [] },
		byModel: [],
		byPrompt: [],
		topByPrompts: [],
		topByRuns: [],
	};
}

export interface PromptPerformance {
	promptId: string;
	value: string;
	tags: string[];
	totalRuns: number;
	brandMentionRate: number;
	competitorMentionRate: number;
	lastRunAt: string | null;
	firstEvaluatedAt: string | null;
}

/**
 * Per-prompt results over the window — the analytics counterpart to listing
 * prompts.
 *
 * A prompt the brand stopped tracking isn't sampled, so it has no results to
 * report and doesn't appear. Every row here is one that ran, which is why there
 * is no flag on it that could only ever say the same thing.
 */
export async function getBrandPromptPerformance(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<PromptPerformance[]> {
	const scope = await resolveScope(brandId, filters);
	if (scope.promptIds.length === 0) return [];
	const { from, to, timezone } = window;

	const [summary, firstEvaluated] = await Promise.all([
		getPromptsSummary(brandId, from, to, timezone, undefined, filters.model, scope.promptIds),
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
			tags: prompt.tags ?? [],
			totalRuns: Number(stats?.total_runs ?? 0),
			brandMentionRate: Number(stats?.brand_mention_rate ?? 0),
			competitorMentionRate: Number(stats?.competitor_mention_rate ?? 0),
			lastRunAt: stats?.last_run_date ? new Date(stats.last_run_date).toISOString() : null,
			firstEvaluatedAt: first ? new Date(first).toISOString() : null,
		};
	});
}

/**
 * Every headline figure the dashboard shows for a brand, over one window, in
 * one answer.
 *
 * There is no `include` parameter: the four computations behind this share a
 * scope resolution and run concurrently, so asking for a subset saves a caller
 * a fraction of one request and costs everyone a parameter to reason about.
 * The long lists — cited domains and URLs, sub-queries, per-prompt results —
 * are endpoints of their own instead.
 */
export async function getBrandAnalytics(brandId: string, window: AnalyticsWindow, filters: AnalyticsFilters = {}) {
	const [visibility, shareOfVoice, models, citations] = await Promise.all([
		getBrandVisibility(brandId, window, filters),
		getBrandShareOfVoice(brandId, window, filters),
		getBrandModelBreakdown(brandId, window, filters),
		getBrandCitations(brandId, window, filters),
	]);

	return {
		brandName: shareOfVoice.brandName,
		visibility: { current: visibility.currentVisibility, series: visibility.series },
		shareOfVoice: { brand: shareOfVoice.brandShare, entries: shareOfVoice.entries, series: shareOfVoice.series },
		models,
		totals: {
			runs: visibility.totalRuns,
			prompts: visibility.totalPrompts,
			citations: visibility.totalCitations,
			uniqueDomains: citations.totals.uniqueDomains,
			uniqueUrls: citations.totals.uniqueUrls,
		},
	};
}
