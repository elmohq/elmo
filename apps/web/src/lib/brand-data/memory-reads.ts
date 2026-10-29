/**
 * The rollup reads of `rollup-read.ts`, answered from a brand's in-memory store.
 * Each function returns what its SQL twin returns, row for row, so the analytics
 * code above them cannot tell which one it is talking to.
 */
import type { AnalyticsScope, DailyScope } from "@/lib/analytics-sql";
import { localDay, localDayOfMs, scopeRows } from "@/lib/brand-data/scope";
import { type BrandStore, getBrandStore } from "@/lib/brand-data/store";
import type { CitationOwner, OwnedDomains } from "@/lib/citation-read";
import type { FanoutBreakdownRow, FanoutModelTotalRow, FanoutPromptTotalRow } from "@/lib/fanout-analysis";
import type {
	CitationCountByModelRow,
	CitationUrlStats,
	CompetitorTotal,
	DailyAssessments,
	FanoutQueryRow,
	MentionTotals,
	ModelRunSums,
	PerPromptCitationDomainRow,
	PerPromptCitationPageRow,
	PerPromptDailyCitationClassRow,
	PerPromptDailyCitationDomainRow,
	PerPromptDailyCompetitorRow,
	PerPromptDailyRuns,
	PerPromptRunStats,
	PromptFirstEvaluatedAt,
	PromptModelDailyCompetitor,
	PromptModelDailyRuns,
	VisibilityDailyAggregate,
} from "@/lib/rollup-read";

const GOOGLE_STATIC_CATEGORY = "google";

export function storeFor(brandId: string): BrandStore {
	const store = getBrandStore(brandId);
	if (!store) throw new Error(`No local data for brand ${brandId}`);
	return store;
}

/** `to_char(ts AT TIME ZONE 'UTC', ...) || '.000Z'`: whole seconds. */
const isoInstant = (ms: number) => `${new Date(Math.floor(ms / 1000) * 1000).toISOString().slice(0, 19)}.000Z`;

function group<K, V>(map: Map<K, V>, key: K, init: () => V): V {
	let value = map.get(key);
	if (value === undefined) {
		value = init();
		map.set(key, value);
	}
	return value;
}

const runSums = () => ({ runs: 0, brand_mentioned_runs: 0, competitor_runs: 0, competitor_mentions: 0 });
const assessmentSums = () => ({
	positive_runs: 0,
	neutral_runs: 0,
	negative_runs: 0,
	mixed_runs: 0,
	position_sum: 0,
	positioned_runs: 0,
});

type Runs = BrandStore["promptRuns"];
function addRuns(into: ReturnType<typeof runSums>, t: Runs, i: number) {
	into.runs += t.runs[i];
	into.brand_mentioned_runs += t.brandMentioned[i];
	into.competitor_runs += t.competitorRuns[i];
	into.competitor_mentions += t.competitorMentions[i];
}
function addAssessments(
	into: ReturnType<typeof assessmentSums>,
	t: Runs | BrandStore["competitorMentions"],
	i: number,
) {
	into.positive_runs += t.positive[i];
	into.neutral_runs += t.neutral[i];
	into.negative_runs += t.negative[i];
	into.mixed_runs += t.mixed[i];
	into.position_sum += t.positionSum[i];
	into.positioned_runs += t.positioned[i];
}

const promptId = (store: BrandStore, index: number) => store.bundle.prompts[index].id;
const model = (store: BrandStore, index: number) => store.bundle.dicts.models[index];

export async function getMentionTotals(scope: AnalyticsScope): Promise<MentionTotals> {
	const store = storeFor(scope.brandId);
	const t = store.promptRuns;
	const totals = { ...runSums(), no_mention_runs: 0, ...assessmentSums() };
	const prompts = new Set<number>();
	const mentioned = new Set<number>();
	let last = Number.NEGATIVE_INFINITY;
	for (const i of scopeRows(store, t, scope)) {
		addRuns(totals, t, i);
		totals.no_mention_runs += t.noMention[i];
		addAssessments(totals, t, i);
		prompts.add(t.prompt[i]);
		if (t.brandMentioned[i] > 0) mentioned.add(t.prompt[i]);
		if (t.lastRunAt[i] > last) last = t.lastRunAt[i];
	}
	return {
		runs: totals.runs,
		brand_mentioned_runs: totals.brand_mentioned_runs,
		competitor_runs: totals.competitor_runs,
		competitor_mentions: totals.competitor_mentions,
		no_mention_runs: totals.no_mention_runs,
		positive_runs: totals.positive_runs,
		neutral_runs: totals.neutral_runs,
		negative_runs: totals.negative_runs,
		mixed_runs: totals.mixed_runs,
		position_sum: totals.position_sum,
		positioned_runs: totals.positioned_runs,
		prompts: prompts.size,
		brand_mentioned_prompts: mentioned.size,
		last_run_at: Number.isFinite(last) ? isoInstant(last) : null,
	};
}

export async function getPerPromptDailyRuns(scope: AnalyticsScope): Promise<PerPromptDailyRuns[]> {
	const store = storeFor(scope.brandId);
	const t = store.promptRuns;
	const groups = new Map<string, PerPromptDailyRuns>();
	for (const i of scopeRows(store, t, scope)) {
		const date = localDay(t.bucket[i], scope.timezone);
		const id = promptId(store, t.prompt[i]);
		addRuns(
			group(groups, `${id}|${date}`, () => ({ prompt_id: id, date, ...runSums() })),
			t,
			i,
		);
	}
	return [...groups.values()].sort((a, b) => cmp(a.prompt_id, b.prompt_id) || cmp(a.date, b.date));
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function getPerPromptDailyCompetitors(scope: AnalyticsScope): Promise<PerPromptDailyCompetitorRow[]> {
	const store = storeFor(scope.brandId);
	const t = store.competitorMentions;
	const groups = new Map<string, PerPromptDailyCompetitorRow>();
	for (const i of scopeRows(store, t, scope)) {
		const date = localDay(t.bucket[i], scope.timezone);
		const id = promptId(store, t.prompt[i]);
		const competitor = store.bundle.dicts.competitors[t.competitor[i]];
		group(groups, `${id}|${date}|${competitor}`, () => ({ prompt_id: id, date, competitor, runs: 0 })).runs +=
			t.runs[i];
	}
	return [...groups.values()].sort(
		(a, b) => cmp(a.prompt_id, b.prompt_id) || cmp(a.date, b.date) || cmp(a.competitor, b.competitor),
	);
}

export async function getCompetitorTotals(scope: AnalyticsScope, limit?: number): Promise<CompetitorTotal[]> {
	const store = storeFor(scope.brandId);
	const t = store.competitorMentions;
	const groups = new Map<number, CompetitorTotal>();
	for (const i of scopeRows(store, t, scope)) {
		const row = group(groups, t.competitor[i], () => ({
			competitor: store.bundle.dicts.competitors[t.competitor[i]],
			runs: 0,
			...assessmentSums(),
		}));
		row.runs += t.runs[i];
		addAssessments(row, t, i);
	}
	const rows = [...groups.values()].sort((a, b) => b.runs - a.runs);
	return limit === undefined ? rows : rows.slice(0, limit);
}

export async function getPerPromptRunStats(scope: AnalyticsScope): Promise<PerPromptRunStats[]> {
	const store = storeFor(scope.brandId);
	const t = store.promptRuns;
	const groups = new Map<number, { row: PerPromptRunStats; days: Set<string>; last: number }>();
	for (const i of scopeRows(store, t, scope)) {
		const entry = group(groups, t.prompt[i], () => ({
			row: {
				prompt_id: promptId(store, t.prompt[i]),
				...runSums(),
				...assessmentSums(),
				run_days: 0,
				last_run_at: null,
				last_run_date: null,
			},
			days: new Set<string>(),
			last: Number.NEGATIVE_INFINITY,
		}));
		addRuns(entry.row, t, i);
		addAssessments(entry.row, t, i);
		entry.days.add(localDay(t.bucket[i], scope.timezone));
		if (t.lastRunAt[i] > entry.last) entry.last = t.lastRunAt[i];
	}
	return [...groups.values()].map(({ row, days, last }) => ({
		...row,
		run_days: days.size,
		last_run_at: Number.isFinite(last) ? isoInstant(last) : null,
		last_run_date: Number.isFinite(last) ? localDayOfMs(last, scope.timezone) : null,
	}));
}

export async function getRunsByModel(scope: AnalyticsScope): Promise<ModelRunSums[]> {
	const store = storeFor(scope.brandId);
	const t = store.promptRuns;
	const groups = new Map<number, ModelRunSums>();
	for (const i of scopeRows(store, t, scope)) {
		const row = group(groups, t.model[i], () => ({
			model: model(store, t.model[i]),
			...runSums(),
			...assessmentSums(),
		}));
		addRuns(row, t, i);
		addAssessments(row, t, i);
	}
	return [...groups.values()].sort((a, b) => b.runs - a.runs);
}

function* dateRange(from: string, to: string) {
	const date = new Date(`${from}T00:00:00Z`);
	const end = new Date(`${to}T00:00:00Z`);
	while (date <= end) {
		yield date.toISOString().slice(0, 10);
		date.setUTCDate(date.getUTCDate() + 1);
	}
}

/** Mirrors the SQL's per-prompt grid: each day takes the prompt's latest result, or its first before it ran. */
export async function getVisibilityDailyAggregate(
	scope: DailyScope,
	brandedPromptIds: string[],
): Promise<VisibilityDailyAggregate[]> {
	if (scope.promptIds.length === 0) return [];
	const store = storeFor(scope.brandId);
	const t = store.promptRuns;
	const observations = new Map<string, Map<string, { runs: number; mentioned: number }>>();
	for (const i of scopeRows(store, t, scope)) {
		const id = promptId(store, t.prompt[i]);
		const days = group(observations, id, () => new Map());
		const obs = group(days, localDay(t.bucket[i], scope.timezone), () => ({ runs: 0, mentioned: 0 }));
		obs.runs += t.runs[i];
		obs.mentioned += t.brandMentioned[i];
	}
	const branded = new Set(brandedPromptIds);
	const dates = [...dateRange(scope.from, scope.to)];
	const totals = dates.map((date) => ({
		date,
		actual_branded_runs: 0,
		actual_branded_mentioned: 0,
		actual_nonbranded_runs: 0,
		actual_nonbranded_mentioned: 0,
		lvcf_branded_runs: 0,
		lvcf_branded_mentioned: 0,
		lvcf_nonbranded_runs: 0,
		lvcf_nonbranded_mentioned: 0,
	}));
	for (const id of new Set(scope.promptIds)) {
		const days = observations.get(id);
		const isBranded = branded.has(id);
		let first: { runs: number; mentioned: number } | undefined;
		if (days) for (const date of dates) if (!first) first = days.get(date);
		let carried = first;
		dates.forEach((date, d) => {
			const obs = days?.get(date);
			if (obs) carried = obs;
			const row = totals[d];
			if (isBranded) {
				if (obs) {
					row.actual_branded_runs += obs.runs;
					row.actual_branded_mentioned += obs.mentioned;
				}
				row.lvcf_branded_runs += carried?.runs ?? 0;
				row.lvcf_branded_mentioned += carried?.mentioned ?? 0;
			} else {
				if (obs) {
					row.actual_nonbranded_runs += obs.runs;
					row.actual_nonbranded_mentioned += obs.mentioned;
				}
				row.lvcf_nonbranded_runs += carried?.runs ?? 0;
				row.lvcf_nonbranded_mentioned += carried?.mentioned ?? 0;
			}
		});
	}
	return totals;
}

export async function getBrandEarliestRunDate(brandId: string): Promise<string | null> {
	const t = storeFor(brandId).promptRuns;
	let min = Number.POSITIVE_INFINITY;
	for (let i = 0; i < t.length; i++) if (t.firstRunAt[i] < min) min = t.firstRunAt[i];
	return Number.isFinite(min) ? new Date(min).toISOString() : null;
}

export async function getPromptsFirstEvaluatedAt(
	brandId: string,
	promptIds: string[],
): Promise<PromptFirstEvaluatedAt[]> {
	if (promptIds.length === 0) return [];
	const store = storeFor(brandId);
	const t = store.promptRuns;
	const wanted = new Set(promptIds.map((id) => store.promptIndex.get(id)));
	const first = new Map<number, number>();
	for (let i = 0; i < t.length; i++) {
		if (!wanted.has(t.prompt[i])) continue;
		const current = first.get(t.prompt[i]);
		if (current === undefined || t.firstRunAt[i] < current) first.set(t.prompt[i], t.firstRunAt[i]);
	}
	return [...first].map(([index, ms]) => ({
		prompt_id: promptId(store, index),
		first_evaluated_at: new Date(ms).toISOString(),
	}));
}

type Citations = BrandStore["citations"];
const page = (store: BrandStore, t: Citations, i: number) => t.page[i];
const pageDomain = (store: BrandStore, p: number) => store.bundle.dicts.domains[store.citationPages.domain[p]];
const pageCategory = (store: BrandStore, p: number) => store.bundle.dicts.categories[store.citationPages.category[p]];
const pageType = (store: BrandStore, p: number) => store.bundle.dicts.pageTypes[store.citationPages.pageType[p]];

export async function getCitationTotal(scope: AnalyticsScope): Promise<number> {
	const store = storeFor(scope.brandId);
	let total = 0;
	for (const i of scopeRows(store, store.citations, scope)) total += store.citations.citations[i];
	return total;
}

export async function getCitationUrlStats(scope: AnalyticsScope): Promise<CitationUrlStats[]> {
	const store = storeFor(scope.brandId);
	const t = store.citations;
	const groups = new Map<number, { count: number; positionSum: number; prompts: Set<number> }>();
	for (const i of scopeRows(store, t, scope)) {
		const g = group(groups, page(store, t, i), () => ({ count: 0, positionSum: 0, prompts: new Set<number>() }));
		g.count += t.citations[i];
		g.positionSum += t.positionSum[i];
		g.prompts.add(t.prompt[i]);
	}
	return [...groups]
		.map(([p, g]) => ({
			url: store.citationPages.url[p],
			domain: pageDomain(store, p),
			title: store.citationPages.title[p],
			static_category: pageCategory(store, p),
			page_type: pageType(store, p),
			count: g.count,
			avg_position: g.count === 0 ? null : Math.round((g.positionSum / g.count) * 10) / 10,
			prompt_count: g.prompts.size,
		}))
		.sort((a, b) => b.count - a.count) as CitationUrlStats[];
}

export async function getPerPromptCitationPages(scope: AnalyticsScope): Promise<PerPromptCitationPageRow[]> {
	const store = storeFor(scope.brandId);
	const t = store.citations;
	const groups = new Map<string, { prompt: number; page: number; count: number }>();
	for (const i of scopeRows(store, t, scope)) {
		group(groups, `${t.prompt[i]}|${t.page[i]}`, () => ({ prompt: t.prompt[i], page: t.page[i], count: 0 })).count +=
			t.citations[i];
	}
	return [...groups.values()]
		.map((g) => ({
			prompt_id: promptId(store, g.prompt),
			url: store.citationPages.url[g.page],
			domain: pageDomain(store, g.page),
			title: store.citationPages.title[g.page],
			count: g.count,
		}))
		.sort((a, b) => cmp(a.prompt_id, b.prompt_id) || b.count - a.count);
}

const GOOGLE_DOMAIN = /(^|\.)google\.[a-z.]+$/;

export async function getPerPromptGooglePages(scope: AnalyticsScope): Promise<PerPromptCitationPageRow[]> {
	const store = storeFor(scope.brandId);
	const t = store.citations;
	const groups = new Map<string, { prompt: number; page: number; count: number }>();
	for (const i of scopeRows(store, t, scope)) {
		const p = t.page[i];
		if (pageCategory(store, p) !== GOOGLE_STATIC_CATEGORY || !GOOGLE_DOMAIN.test(pageDomain(store, p))) continue;
		group(groups, `${t.prompt[i]}|${p}`, () => ({ prompt: t.prompt[i], page: p, count: 0 })).count += t.citations[i];
	}
	return [...groups.values()]
		.map((g) => ({
			prompt_id: promptId(store, g.prompt),
			url: store.citationPages.url[g.page],
			domain: pageDomain(store, g.page),
			title: store.citationPages.title[g.page],
			count: g.count,
		}))
		.sort((a, b) => cmp(a.prompt_id, b.prompt_id) || b.count - a.count || cmp(a.url ?? "", b.url ?? ""));
}

export async function getPerPromptCitationDomains(scope: AnalyticsScope): Promise<PerPromptCitationDomainRow[]> {
	const store = storeFor(scope.brandId);
	const t = store.citations;
	const groups = new Map<string, PerPromptCitationDomainRow>();
	for (const i of scopeRows(store, t, scope)) {
		const id = promptId(store, t.prompt[i]);
		const domain = pageDomain(store, t.page[i]);
		group(groups, `${id}|${domain}`, () => ({ prompt_id: id, domain, count: 0 })).count += t.citations[i];
	}
	return [...groups.values()].sort((a, b) => cmp(a.prompt_id, b.prompt_id));
}

export async function getPerPromptDailyCitationDomains(
	scope: AnalyticsScope,
): Promise<PerPromptDailyCitationDomainRow[]> {
	const store = storeFor(scope.brandId);
	const t = store.citations;
	const groups = new Map<string, PerPromptDailyCitationDomainRow>();
	for (const i of scopeRows(store, t, scope)) {
		const id = promptId(store, t.prompt[i]);
		const date = localDay(t.bucket[i], scope.timezone);
		const domain = pageDomain(store, t.page[i]);
		group(groups, `${id}|${date}|${domain}`, () => ({ prompt_id: id, date, domain, count: 0 })).count += t.citations[i];
	}
	return [...groups.values()].sort((a, b) => cmp(a.prompt_id, b.prompt_id) || cmp(a.date, b.date));
}

/** Mirrors `ownersCte`: the brand's when the domain or a parent of it is the brand's, else a competitor's. */
export function ownerResolver(owned: OwnedDomains): (domain: string) => CitationOwner | null {
	const brand = new Set(owned.brandDomains);
	const competitor = new Set(owned.competitorDomains);
	const cache = new Map<string, CitationOwner | null>();
	return (domain) => {
		let owner = cache.get(domain);
		if (owner !== undefined) return owner;
		const labels = domain.split(".");
		let found: CitationOwner | null = null;
		for (let i = 0; i < labels.length && found !== "brand"; i++) {
			const suffix = labels.slice(i).join(".");
			if (brand.has(suffix)) found = "brand";
			else if (!found && competitor.has(suffix)) found = "competitor";
		}
		owner = found;
		cache.set(domain, owner);
		return owner;
	};
}

export async function getPerPromptDailyCitationClasses(
	scope: AnalyticsScope,
	owned: OwnedDomains,
): Promise<PerPromptDailyCitationClassRow[]> {
	const store = storeFor(scope.brandId);
	const t = store.citations;
	const ownerOf = ownerResolver(owned);
	const groups = new Map<string, PerPromptDailyCitationClassRow>();
	for (const i of scopeRows(store, t, scope)) {
		const p = t.page[i];
		const category = pageCategory(store, p);
		if (category === GOOGLE_STATIC_CATEGORY) continue;
		const id = promptId(store, t.prompt[i]);
		const date = localDay(t.bucket[i], scope.timezone);
		const owner = ownerOf(pageDomain(store, p));
		const type = pageType(store, p);
		group(groups, `${id}|${date}|${owner}|${category}|${type}`, () => ({
			prompt_id: id,
			date,
			owner,
			static_category: category,
			page_type: type,
			count: 0,
		})).count += t.citations[i];
	}
	return [...groups.values()].sort((a, b) => cmp(a.prompt_id, b.prompt_id) || cmp(a.date, b.date));
}

export async function getCitationsCountByModel(scope: AnalyticsScope): Promise<CitationCountByModelRow[]> {
	const store = storeFor(scope.brandId);
	const t = store.citations;
	const groups = new Map<number, CitationCountByModelRow>();
	for (const i of scopeRows(store, t, scope)) {
		group(groups, t.model[i], () => ({ model: model(store, t.model[i]), count: 0 })).count += t.citations[i];
	}
	return [...groups.values()];
}

export async function getFanoutBreakdown(scope: AnalyticsScope): Promise<FanoutBreakdownRow[]> {
	const store = storeFor(scope.brandId);
	const t = store.webQueries;
	const groups = new Map<string, FanoutBreakdownRow>();
	for (const i of scopeRows(store, t, scope)) {
		const row = group(groups, `${t.prompt[i]}|${t.model[i]}|${t.query[i]}`, () => ({
			prompt_id: promptId(store, t.prompt[i]),
			model: model(store, t.model[i]),
			query: store.bundle.dicts.queries[t.query[i]],
			count: 0,
			brand_mentions: 0,
		}));
		row.count += t.runs[i];
		row.brand_mentions += t.brandMentioned[i];
	}
	return [...groups.values()];
}

export async function getFanoutModelTotals(scope: AnalyticsScope): Promise<FanoutModelTotalRow[]> {
	const store = storeFor(scope.brandId);
	const t = store.promptRuns;
	const groups = new Map<number, FanoutModelTotalRow>();
	for (const i of scopeRows(store, t, scope)) {
		const row = group(groups, t.model[i], () => ({
			model: model(store, t.model[i]),
			runs: 0,
			fanout_runs: 0,
			total_queries: 0,
		}));
		if (t.web[i] === 1) row.runs += t.runs[i];
		row.fanout_runs += t.fanoutRuns[i];
		row.total_queries += t.fanoutQueries[i];
	}
	return [...groups.values()].sort((a, b) => b.total_queries - a.total_queries);
}

function queryGroups(scope: AnalyticsScope) {
	const store = storeFor(scope.brandId);
	const t = store.webQueries;
	const groups = new Map<number, { runs: number; brandMentions: number; prompts: Set<number> }>();
	for (const i of scopeRows(store, t, scope)) {
		const g = group(groups, t.query[i], () => ({ runs: 0, brandMentions: 0, prompts: new Set<number>() }));
		g.runs += t.runs[i];
		g.brandMentions += t.brandMentioned[i];
		g.prompts.add(t.prompt[i]);
	}
	return { store, groups };
}

export async function getFanoutQueryPage(
	scope: AnalyticsScope,
	search: string | undefined,
	limit: number,
	offset: number,
): Promise<{ rows: FanoutQueryRow[]; total: number }> {
	const { store, groups } = queryGroups(scope);
	const term = search?.trim().toLowerCase();
	const rows = [...groups]
		.map(([q, g]) => ({ query: store.bundle.dicts.queries[q], runs: g.runs, prompt_count: g.prompts.size }))
		.filter((row) => !term || row.query.toLowerCase().includes(term))
		.sort((a, b) => b.runs - a.runs || b.prompt_count - a.prompt_count || cmp(a.query, b.query));
	return { rows: rows.slice(offset, offset + limit), total: rows.length };
}

export async function getFanoutQueryTotals(scope: AnalyticsScope) {
	const { groups } = queryGroups(scope);
	let total = 0;
	let mentions = 0;
	for (const g of groups.values()) {
		total += g.runs;
		mentions += g.brandMentions;
	}
	return { total_queries: total, unique_queries: groups.size, brand_mentions: mentions };
}

export async function getFanoutPromptTotals(scope: AnalyticsScope): Promise<FanoutPromptTotalRow[]> {
	const store = storeFor(scope.brandId);
	const t = store.promptRuns;
	const groups = new Map<number, FanoutPromptTotalRow>();
	for (const i of scopeRows(store, t, scope)) {
		group(groups, t.prompt[i], () => ({ prompt_id: promptId(store, t.prompt[i]), runs: 0 })).runs += t.fanoutRuns[i];
	}
	return [...groups.values()];
}

export async function getDailyAssessments(scope: AnalyticsScope): Promise<DailyAssessments[]> {
	const store = storeFor(scope.brandId);
	const t = store.promptRuns;
	const groups = new Map<string, DailyAssessments>();
	for (const i of scopeRows(store, t, scope)) {
		const date = localDay(t.bucket[i], scope.timezone);
		addAssessments(
			group(groups, date, () => ({ date, ...assessmentSums() })),
			t,
			i,
		);
	}
	return [...groups.values()].sort((a, b) => cmp(a.date, b.date));
}

export async function getPromptModelDailyRuns(scope: AnalyticsScope): Promise<PromptModelDailyRuns[]> {
	const store = storeFor(scope.brandId);
	const t = store.promptRuns;
	const groups = new Map<string, PromptModelDailyRuns>();
	for (const i of scopeRows(store, t, scope)) {
		const date = localDay(t.bucket[i], scope.timezone);
		const row = group(groups, `${t.prompt[i]}|${t.model[i]}|${date}`, () => ({
			prompt_id: promptId(store, t.prompt[i]),
			model: model(store, t.model[i]),
			date,
			...runSums(),
			...assessmentSums(),
		}));
		addRuns(row, t, i);
		addAssessments(row, t, i);
	}
	return [...groups.values()];
}

export async function getPromptModelDailyCompetitors(scope: AnalyticsScope): Promise<PromptModelDailyCompetitor[]> {
	const store = storeFor(scope.brandId);
	const t = store.competitorMentions;
	const groups = new Map<string, PromptModelDailyCompetitor>();
	for (const i of scopeRows(store, t, scope)) {
		const date = localDay(t.bucket[i], scope.timezone);
		const row = group(groups, `${t.prompt[i]}|${t.model[i]}|${date}|${t.competitor[i]}`, () => ({
			prompt_id: promptId(store, t.prompt[i]),
			model: model(store, t.model[i]),
			date,
			competitor: store.bundle.dicts.competitors[t.competitor[i]],
			runs: 0,
			...assessmentSums(),
		}));
		row.runs += t.runs[i];
		addAssessments(row, t, i);
	}
	return [...groups.values()];
}
