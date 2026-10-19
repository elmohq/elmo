/**
 * No session, Request or auth: a caller passes a brand it has already decided
 * the requester may see, so the dashboard and `/api/v1` cannot compute
 * different numbers from the same data.
 */

import { getModelMeta } from "@workspace/config/models";
import { extractDomain } from "@workspace/lib/citations/domain-categories";
import { rollUpCitationDomains, rollUpCitationUrls } from "@workspace/lib/citations/rollup";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { eq } from "drizzle-orm";
import type { DailyScope } from "@/lib/analytics-sql";
import { isCalendarDay } from "@/lib/analytics-sql";
import { generateDateRange } from "@/lib/chart-utils";
import { computeFanoutAnalysis, type FanoutAnalysis, type FanoutLimitOverrides } from "@/lib/fanout-analysis";
import { buildLandscape, type Landscape } from "@/lib/landscape";
import { assessedPassage } from "@/lib/passage";
import { getSentimentQuotes, type SentimentQuoteRow } from "@/lib/postgres-read";
import {
	getCitationDomainPromptCounts,
	getCitationsCountByModel,
	getCitationTotal,
	getCitationUrlStats,
	getCompetitorTotals,
	getDailyAssessments,
	getFanoutBreakdown,
	getFanoutModelTotals,
	getFanoutPromptTotals,
	getMentionTotals,
	getPerPromptDailyCompetitors,
	getPerPromptDailyRuns,
	getPerPromptRunStats,
	getPromptModelDailyCompetitors,
	getPromptModelDailyRuns,
	getPromptsFirstEvaluatedAt,
	getRunsByModel,
	getVisibilityDailyAggregate,
	type PerPromptDailyRuns,
} from "@/lib/rollup-read";
import {
	averagePosition,
	isSentiment,
	type MentionQuality,
	mentionQuality,
	NO_ASSESSMENTS,
	type PositionPoint,
	type Sentiment,
	type SentimentCounts,
	type SentimentSummary,
	sentimentCounts,
	sentimentSummary,
	sumAssessments,
} from "@/lib/sentiment";
import { shiftDateStr } from "@/lib/timezone-utils";
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
 * `analytics-sql`, so for those the bounds can sit a zone offset from the rows
 * the queries returned. That only matters where the bounds become a *window*,
 * and only instants reach the one below; share of voice turns these into UTC day
 * labels, which a calendar day survives. Mirror `windowStart` here before a
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

function analyticsScope(
	brandId: string,
	window: AnalyticsWindow,
	promptIds: string[],
	filters: AnalyticsFilters,
): DailyScope {
	return { brandId, from: window.from, to: window.to, timezone: window.timezone, promptIds, model: filters.model };
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

	const scope = analyticsScope(brandId, window, promptIds, filters);
	const [daily, totalCitations] = await Promise.all([
		getVisibilityDailyAggregate(scope, brandedPromptIds),
		getCitationTotal(scope),
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

interface ShareOfVoiceEntry extends MentionQuality {
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
// Off the per-prompt rows rather than the per-competitor query, which counts mention instances
// and would not agree with them.
function shareSeries(perPromptDaily: PerPromptDailyRuns[], dateRange: string[]) {
	return shareOfVoiceTimeSeriesLVCF(
		perPromptDaily.map((row) => ({
			promptId: row.prompt_id,
			date: String(row.date),
			brandMentions: row.brand_mentioned_runs,
			competitorMentions: row.competitor_mentions,
		})),
		dateRange,
	);
}

export async function getBrandShareOfVoice(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<BrandShareOfVoice> {
	const [brandRow, resolved] = await Promise.all([
		db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1),
		resolveScope(brandId, filters),
	]);
	const brandName = brandRow[0]?.name ?? "Your brand";
	if (resolved.promptIds.length === 0) {
		return { brandName, brandShare: null, totalRuns: 0, entries: [], series: [] };
	}

	const bounds = windowInstants(window);
	const dateRange = generateDateRange(bounds.start, new Date(bounds.end.getTime() - 1));
	const scope = analyticsScope(brandId, window, resolved.promptIds, filters);
	const [totals, perPromptDaily, perPromptCompetitorDaily, competitorRows] = await Promise.all([
		getMentionTotals(scope),
		getPerPromptDailyRuns(scope),
		getPerPromptDailyCompetitors(scope),
		getCompetitorTotals(scope),
	]);
	const competitorTotals = new Map(competitorRows.map((row) => [row.competitor, row]));

	const standings = shareOfVoiceLeaderboardLVCF(
		perPromptDaily.map((row) => ({
			promptId: row.prompt_id,
			date: String(row.date),
			brand: row.brand_mentioned_runs,
		})),
		perPromptCompetitorDaily.map((row) => ({
			promptId: row.prompt_id,
			date: String(row.date),
			competitor: row.competitor,
			mentions: row.runs,
		})),
		dateRange,
	);

	const promptsByName = new Map(standings.competitors.map((c) => [c.name, c.prompts]));
	const { entries, brandShare } = computeShareOfVoice(
		{ name: brandName, mentions: standings.brandMentions },
		standings.competitors.map((c) => ({ name: c.name, mentions: c.mentions })),
	);

	const series = shareSeries(perPromptDaily, dateRange);

	// Exact ratios: each edge rounds once, on the way out.
	return {
		brandName,
		brandShare,
		totalRuns: totals.runs,
		entries: entries.map((entry) => ({
			name: entry.name,
			isBrand: entry.isBrand,
			mentions: entry.mentions,
			prompts: entry.isBrand ? standings.brandPrompts : (promptsByName.get(entry.name) ?? 0),
			share: entry.share,
			...mentionQuality((entry.isBrand ? totals : competitorTotals.get(entry.name)) ?? NO_ASSESSMENTS),
		})),
		series,
	};
}

export interface ModelVisibility extends MentionQuality {
	model: string;
	label: string;
	runs: number;
	brandMentions: number;
	visibility: number | null;
	citations: number;
}

async function getBrandModelBreakdown(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<ModelVisibility[]> {
	const { promptIds } = await resolveScope(brandId, filters);
	if (promptIds.length === 0) return [];
	const scope = analyticsScope(brandId, window, promptIds, filters);

	const [rows, citationRows] = await Promise.all([getRunsByModel(scope), getCitationsCountByModel(scope)]);
	const citationsByModel = new Map(citationRows.map((row) => [row.model, row.count]));

	return rows.map((row) => {
		const runs = row.runs;
		const mentions = row.brand_mentioned_runs;
		return {
			model: row.model,
			label: getModelMeta(row.model).label,
			runs,
			brandMentions: mentions,
			visibility: runs === 0 ? null : mentions / runs,
			citations: citationsByModel.get(row.model) ?? 0,
			...mentionQuality(row),
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
	if (promptIds.length === 0) {
		return { urls: [], domains: [], totals: { citations: 0, uniqueDomains: 0, uniqueUrls: 0 } };
	}
	const scope = analyticsScope(brandId, window, promptIds, filters);

	// Instants, so it lands where this window begins rather than rounding
	// outward to whole days.
	const { start, end } = windowInstants(window);
	const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime())).toISOString();
	const previousEnd = start.toISOString();

	const [{ brandDomains, competitorDomains }, current, previous, promptsByDomain] = await Promise.all([
		citationContext(brandId),
		getCitationUrlStats(scope),
		getCitationUrlStats({ ...scope, from: previousStart, to: previousEnd }),
		getCitationDomainPromptCounts(scope),
	]);

	const previousUrls = new Set(previous.map((stat) => stat.url));
	const previousDomainCounts = new Map<string, number>();
	for (const stat of previous) {
		previousDomainCounts.set(stat.domain, (previousDomainCounts.get(stat.domain) ?? 0) + Number(stat.count));
	}

	const promptCounts = new Map(current.map((stat) => [stat.url, Number(stat.prompt_count)]));
	const rolled = rollUpCitationUrls(current, brandDomains, competitorDomains);
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
	const [brandRow, resolved] = await Promise.all([
		db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1),
		resolveScope(brandId, filters),
	]);
	const brandName = brandRow[0]?.name ?? "Your brand";

	const promptIds = options.promptId ? resolved.promptIds.filter((id) => id === options.promptId) : resolved.promptIds;
	if (promptIds.length === 0) return { brandName, ...emptyFanout() };

	const scope = analyticsScope(brandId, window, promptIds, filters);
	const [breakdown, modelTotals, promptTotals] = await Promise.all([
		getFanoutBreakdown(scope),
		getFanoutModelTotals(scope),
		getFanoutPromptTotals(scope),
	]);

	const promptValues = new Map(
		resolved.prompts.filter((prompt) => promptIds.includes(prompt.id)).map((prompt) => [prompt.id, prompt.value]),
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

export interface PromptPerformance extends MentionQuality {
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
	const resolved = await resolveScope(brandId, filters);
	if (resolved.promptIds.length === 0) return [];

	const [runStats, firstEvaluated] = await Promise.all([
		getPerPromptRunStats(analyticsScope(brandId, window, resolved.promptIds, filters)),
		getPromptsFirstEvaluatedAt(brandId, resolved.promptIds),
	]);

	const statsById = new Map(runStats.map((row) => [row.prompt_id, row]));
	const firstById = new Map(firstEvaluated.map((row) => [row.prompt_id, row.first_evaluated_at]));

	return resolved.prompts.map((prompt) => {
		const stats = statsById.get(prompt.id);
		const first = firstById.get(prompt.id);
		const runs = stats?.runs ?? 0;
		return {
			promptId: prompt.id,
			value: prompt.value,
			tags: prompt.tags ?? [],
			totalRuns: runs,
			brandMentionRate: runs > 0 ? (stats?.brand_mentioned_runs ?? 0) / runs : 0,
			competitorMentionRate: runs > 0 ? (stats?.competitor_runs ?? 0) / runs : 0,
			lastRunAt: stats?.last_run_date ? new Date(stats.last_run_date).toISOString() : null,
			firstEvaluatedAt: first ? new Date(first).toISOString() : null,
			...mentionQuality(stats ?? NO_ASSESSMENTS),
		};
	});
}

export interface BrandMentionQuality {
	sentiment: SentimentSummary & { series: (SentimentCounts & { date: string })[] };
	position: { average: number | null; series: PositionPoint[] };
}

export async function getBrandMentionQuality(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<BrandMentionQuality> {
	const { promptIds } = await resolveScope(brandId, filters);
	if (promptIds.length === 0) {
		return { sentiment: { ...sentimentSummary(NO_ASSESSMENTS), series: [] }, position: { average: null, series: [] } };
	}
	const bounds = windowInstants(window);
	const dateRange = generateDateRange(bounds.start, new Date(bounds.end.getTime() - 1));
	const rows = await getDailyAssessments(analyticsScope(brandId, window, promptIds, filters));
	const byDate = new Map(rows.map((row) => [row.date, row]));
	const day = (date: string) => byDate.get(date) ?? NO_ASSESSMENTS;
	const totals = sumAssessments(rows);
	return {
		sentiment: {
			...sentimentSummary(totals),
			series: dateRange.map((date) => ({ date, ...sentimentCounts(day(date)) })),
		},
		position: {
			average: averagePosition(totals.position_sum, totals.positioned_runs),
			series: dateRange.map((date) => ({
				date,
				average: averagePosition(day(date).position_sum, day(date).positioned_runs),
			})),
		},
	};
}

/** The long lists — cited domains and URLs, sub-queries, per-prompt results —
 * are endpoints of their own. */
export async function getBrandAnalytics(brandId: string, window: AnalyticsWindow, filters: AnalyticsFilters = {}) {
	const [visibility, shareOfVoice, models, citations, quality] = await Promise.all([
		getBrandVisibility(brandId, window, filters),
		getBrandShareOfVoice(brandId, window, filters),
		getBrandModelBreakdown(brandId, window, filters),
		getBrandCitations(brandId, window, filters),
		getBrandMentionQuality(brandId, window, filters),
	]);

	return {
		brandName: shareOfVoice.brandName,
		visibility: { current: visibility.currentVisibility, series: visibility.series },
		shareOfVoice: { brand: shareOfVoice.brandShare, entries: shareOfVoice.entries, series: shareOfVoice.series },
		models,
		sentiment: quality.sentiment,
		position: quality.position,
		totals: {
			runs: visibility.totalRuns,
			prompts: visibility.totalPrompts,
			citations: visibility.totalCitations,
			uniqueDomains: citations.totals.uniqueDomains,
			uniqueUrls: citations.totals.uniqueUrls,
		},
	};
}

export async function getCompetitiveLandscape(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<Landscape> {
	const [brandRow, competitorRows, resolved] = await Promise.all([
		db.select({ name: brands.name, website: brands.website }).from(brands).where(eq(brands.id, brandId)).limit(1),
		db
			.select({ name: competitors.name, domains: competitors.domains })
			.from(competitors)
			.where(eq(competitors.brandId, brandId)),
		resolveScope(brandId, filters),
	]);
	const bounds = windowInstants(window);
	const dates = generateDateRange(bounds.start, new Date(bounds.end.getTime() - 1));
	const brand = { name: brandRow[0]?.name ?? "Your brand", domain: extractDomain(brandRow[0]?.website ?? "") || null };
	const tracked = competitorRows.map((c) => ({
		name: c.name,
		domain: c.domains[0] ? extractDomain(c.domains[0]) : null,
	}));
	const scope = analyticsScope(brandId, window, resolved.promptIds, filters);
	const [runs, competitorRuns] =
		resolved.promptIds.length === 0
			? [[], []]
			: await Promise.all([getPromptModelDailyRuns(scope), getPromptModelDailyCompetitors(scope)]);
	return buildLandscape({ brand, competitors: tracked, dates, runs, competitorRuns });
}

export interface SentimentQuote {
	runId: string;
	promptId: string;
	prompt: string;
	model: string;
	createdAt: string;
	sentiment: Sentiment;
	/** Markdown. */
	passage: string;
}

export interface PromptSentiment {
	promptId: string;
	value: string;
	tags: string[];
	sentiment: SentimentSummary;
}

export interface BrandSentiment {
	/** Least positive first. */
	prompts: PromptSentiment[];
	/** The assessments the judge was surest of on each side, one per prompt. */
	praise: SentimentQuote[];
	mixed: SentimentQuote[];
	criticism: SentimentQuote[];
}

const QUOTES_PER_SIDE = 5;

/** The overall split comes from the competitive landscape, which every headline shares. */
export async function getBrandSentiment(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<BrandSentiment> {
	const resolved = await resolveScope(brandId, filters);
	const scope = analyticsScope(brandId, window, resolved.promptIds, filters);
	const [perPrompt, praise, mixed, criticism] = await Promise.all([
		resolved.promptIds.length > 0 ? getPerPromptRunStats(scope) : [],
		getSentimentQuotes(scope, ["positive"], QUOTES_PER_SIDE),
		getSentimentQuotes(scope, ["mixed"], QUOTES_PER_SIDE),
		getSentimentQuotes(scope, ["negative"], QUOTES_PER_SIDE),
	]);
	const promptsById = new Map(resolved.prompts.map((prompt) => [prompt.id, prompt]));
	const quote = (row: SentimentQuoteRow): SentimentQuote[] => {
		const passage = assessedPassage(row.text_content, row.brand);
		const sentiment = row.brand.sentiment;
		if (!passage || !isSentiment(sentiment)) return [];
		return [
			{
				runId: row.id,
				promptId: row.prompt_id,
				prompt: promptsById.get(row.prompt_id)?.value ?? "",
				model: row.model,
				createdAt: new Date(row.created_at).toISOString(),
				sentiment,
				passage,
			},
		];
	};
	const prompts = perPrompt
		.flatMap((row): PromptSentiment[] => {
			const prompt = promptsById.get(row.prompt_id);
			const sentiment = sentimentSummary(row);
			if (!prompt || sentiment.score === null) return [];
			return [{ promptId: prompt.id, value: prompt.value, tags: prompt.tags ?? [], sentiment }];
		})
		.sort((a, b) => (a.sentiment.score ?? 0) - (b.sentiment.score ?? 0));
	return {
		prompts,
		praise: praise.flatMap(quote),
		mixed: mixed.flatMap(quote),
		criticism: criticism.flatMap(quote),
	};
}
