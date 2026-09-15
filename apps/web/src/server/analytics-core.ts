/**
 * No session, Request or auth: a caller passes a brand it has already decided
 * the requester may see, so the dashboard and `/api/v1` cannot compute
 * different numbers from the same data.
 */

import { parseModelFilter } from "@workspace/config/model-filter";
import { getModelMeta } from "@workspace/config/models";
import { extractDomain, normalizeUrl } from "@workspace/lib/citations/domain-categories";
import { classifyUrl as classifyUrlShared } from "@workspace/lib/citations/domain-lists";
import { rollUpCitationDomains, rollUpCitationUrls } from "@workspace/lib/citations/rollup";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { eq } from "drizzle-orm";
import {
	type CitationCountByModelRow,
	getBrandMentionRateByModel,
	getBrandMentionTotals,
	getCitationDomainPromptCounts,
	getCitationsCountByModel,
	getCitationsTotalCount,
	getCitationUrlStats,
	getPerPromptDailyCompetitorMentions,
	getPerPromptDailyMentions,
	getPromptsSummary,
	getVisibilityDailyAggregate,
} from "@/lib/analytics-read";
import { API_PROVIDER_IDS, isCalendarDay } from "@/lib/analytics-sql";
import { generateDateRange } from "@/lib/chart-utils";
import { computeFanoutAnalysis, type FanoutAnalysis, type FanoutLimitOverrides } from "@/lib/fanout-analysis";
import {
	getFanoutBreakdown,
	getFanoutModelTotals,
	getFanoutPromptTotals,
	getPromptsFirstEvaluatedAt,
} from "@/lib/postgres-read";
import { computeShareOfVoice, shareOfVoiceLeaderboardLVCF, shareOfVoiceTimeSeriesLVCF } from "@/lib/visibility-stats";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

export interface AnalyticsWindow {
	/** Either calendar days (`YYYY-MM-DD`, read in `timezone`, `to` inclusive) or
	 * ISO instants (`to` exclusive). */
	from: string;
	to: string;
	timezone: string;
}

/**
 * Calendar days are read as midnight UTC here but in the caller's `timezone` by
 * `postgres-read`, so for those the bounds can sit a zone offset from the rows
 * the queries returned. That only matters where the bounds become a *window*,
 * and only instants reach the one below; share of voice turns these into UTC day
 * labels, which a calendar day survives. Mirror `postgres-read` here before a
 * calendar-day caller needs a window rather than a label.
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
 * The series carries the last value forward, so a gap in a prompt's schedule
 * doesn't read as a dip. "Current" is the last plotted point, not the average.
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
	share: number;
}

export interface BrandShareOfVoice {
	brandName: string;
	brandShare: number | null;
	totalRuns: number;
	entries: ShareOfVoiceEntry[];
	series: { date: string; share: number | null }[];
}

/** Standings carry each prompt's latest counts forward, so the headline and the
 * trend's last point are the same number. */
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

	// Off this row rather than the per-competitor query, which counts mention
	// instances and would not agree with it.
	const series = shareOfVoiceTimeSeriesLVCF(
		perPromptDaily.map((row) => ({
			promptId: row.prompt_id,
			date: String(row.date),
			brandMentions: row.brand_mentions,
			competitorMentions: row.competitor_mentions,
		})),
		dateRange,
	);

	// Exact ratios: each edge rounds once, on the way out.
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

/** Whether a citations-by-model row was reached by a grounded API call — the
 * same test `modelFilter` applies at query time. */
export function isGroundedCitationRow(row: Pick<CitationCountByModelRow, "provider" | "web_search_enabled">): boolean {
	return row.web_search_enabled && API_PROVIDER_IDS.includes(row.provider);
}

/**
 * Sums `getCitationsCountByModel`'s (model, provider, web_search_enabled)
 * rows down to one count per bare model, so it lines up with
 * `getBrandMentionRateByModel`'s rows. A target's premium-ness restricts the
 * sum to matching rows only; no target (the filter is unset) sums every row
 * for that model, matching how the unfiltered mention-rate query counts runs
 * across both grounded and standard.
 */
export function citationsByBareModel(
	rows: CitationCountByModelRow[],
	target: { model: string; premium: boolean } | null,
): Map<string, number> {
	const byModel = new Map<string, number>();
	for (const row of rows) {
		if (target && isGroundedCitationRow(row) !== target.premium) continue;
		byModel.set(row.model, (byModel.get(row.model) ?? 0) + row.count);
	}
	return byModel;
}

async function getBrandModelBreakdown(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<ModelVisibility[]> {
	const { promptIds } = await resolveScope(brandId, filters);
	if (promptIds.length === 0) return [];
	const { from, to, timezone } = window;

	const [rows, citationRows] = await Promise.all([
		getBrandMentionRateByModel(brandId, from, to, timezone, promptIds, filters.model),
		getCitationsCountByModel(brandId, from, to, timezone, promptIds),
	]);
	const citationsByModel = citationsByBareModel(citationRows, filters.model ? parseModelFilter(filters.model) : null);

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

export async function getBrandCitations(brandId: string, window: AnalyticsWindow, filters: AnalyticsFilters = {}) {
	const { promptIds } = await resolveScope(brandId, filters);
	const { from, to, timezone } = window;
	if (promptIds.length === 0) {
		return { urls: [], domains: [], totals: { citations: 0, uniqueDomains: 0, uniqueUrls: 0 } };
	}

	// Instants, so it lands where this window begins rather than rounding
	// outward to whole days.
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

	// A domain's URLs can be cited by disjoint prompts, so its distinct count
	// cannot be the largest of its parts the way a single URL's can.
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

export async function getBrandQueryFanout(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
	options: {
		promptId?: string;
		uncapped?: boolean;
	} = {},
): Promise<FanoutAnalysis & { brandName: string }> {
	const { from, to, timezone } = window;
	const [brandRow, scope] = await Promise.all([
		db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1),
		resolveScope(brandId, filters),
	]);
	const brandName = brandRow[0]?.name ?? "Your brand";

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
	// Without this every byPrompt row reports zero runs and a zero average.
	const promptRuns = new Map(promptTotals.map((row) => [row.prompt_id, row.runs]));

	return {
		brandName,
		...computeFanoutAnalysis(breakdown, modelTotals, promptValues, {
			promptRuns,
			limits: fanoutLimits(options),
		}),
	};
}

/** Display caps, so a caller that pages one of these lists is not paging a
 * silently truncated one. */
function fanoutLimits(options: { promptId?: string; uncapped?: boolean }): FanoutLimitOverrides | undefined {
	if (options.uncapped) {
		return { topQueries: UNCAPPED, breadth: UNCAPPED, terms: UNCAPPED, perModelTop: UNCAPPED, variations: UNCAPPED };
	}
	if (options.promptId) return { topQueries: 2000, perModelTop: 2000, variations: 2000 };
	return undefined;
}

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

/** Only prompts that ran appear, which is why no row carries an `enabled` flag. */
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

/** The long lists — cited domains and URLs, sub-queries, per-prompt results —
 * are endpoints of their own. */
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
