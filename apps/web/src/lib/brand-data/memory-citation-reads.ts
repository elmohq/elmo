/** Mirrors `citation-read.ts` row for row. A URL ordering computed once per store turns each `count DESC, url` sort into a counting sort. */
import { CONTENT_PUBLISHER_CATEGORIES } from "@workspace/lib/citations/domain-categories";
import type { AnalyticsScope } from "@/lib/analytics-sql";
import { ownerResolver, storeFor } from "@/lib/brand-data/memory-reads";
import { scopeRows } from "@/lib/brand-data/scope";
import type { BrandStore } from "@/lib/brand-data/store";
import type { CitationFlowRow } from "@/lib/citation-flow";
import type {
	CitationClassTotalRow,
	CitationDomainStatsRow,
	CitationSummary,
	CitationUrlFilter,
	CitationUrlListRow,
	DroppedCitationPageRow,
	OwnedDomains,
	RedditPageRow,
} from "@/lib/citation-read";

const GOOGLE_STATIC_CATEGORY = "google";
const OWNERS = [null, "brand", "competitor"] as const;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `round(sum::numeric / count, 1)::float`, in integers so halves round away from zero as Postgres does. */
function avgPosition(positionSum: number, count: number): number | null {
	if (count === 0) return null;
	const sign = positionSum * count < 0 ? -1 : 1;
	const tenths = Math.floor((Math.abs(positionSum) * 20 + Math.abs(count)) / (2 * Math.abs(count)));
	return (sign * tenths) / 10;
}

interface StoreIndex {
	pagesByUrl: Int32Array;
	urlRank: Int32Array;
	googleCategory: number;
	isGoogle: Uint8Array;
	redditDomain: Uint8Array;
	rows: Map<string, Int32Array>;
	sums: Map<string, PageSums>;
	owners: Map<string, Uint8Array>;
	classes: Map<string, PageClasses>;
	domainStats: Map<string, DomainStat[]>;
}

const indexes = new WeakMap<BrandStore, StoreIndex>();

function storeIndex(store: BrandStore): StoreIndex {
	let index = indexes.get(store);
	if (index) return index;
	const pages = store.citationPages;
	let sorted = true;
	for (let i = 1; i < pages.length && sorted; i++) sorted = pages.url[i - 1] <= pages.url[i];
	const pagesByUrl = sorted
		? Int32Array.from({ length: pages.length }, (_, i) => i)
		: Int32Array.from(
				Array.from({ length: pages.length }, (_, i) => i).sort((a, b) => cmp(pages.url[a], pages.url[b])),
			);
	const urlRank = new Int32Array(pages.length);
	pagesByUrl.forEach((p, rank) => {
		urlRank[p] = rank;
	});
	const googleCategory = store.bundle.dicts.categories.indexOf(GOOGLE_STATIC_CATEGORY);
	const isGoogle = new Uint8Array(pages.length);
	for (let p = 0; p < pages.length; p++) isGoogle[p] = pages.category[p] === googleCategory ? 1 : 0;
	const redditDomain = Uint8Array.from(store.bundle.dicts.domains, (d) =>
		d === "reddit.com" || d.endsWith(".reddit.com") ? 1 : 0,
	);
	index = {
		pagesByUrl,
		urlRank,
		googleCategory,
		isGoogle,
		redditDomain,
		rows: new Map(),
		sums: new Map(),
		owners: new Map(),
		classes: new Map(),
		domainStats: new Map(),
	};
	indexes.set(store, index);
	return index;
}

function remember<V>(cache: Map<string, V>, key: string, make: () => V): V {
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	const value = make();
	if (cache.size >= 12) cache.delete(cache.keys().next().value as string);
	cache.set(key, value);
	return value;
}

function rowsFor(store: BrandStore, scope: AnalyticsScope): Int32Array {
	return remember(storeIndex(store).rows, JSON.stringify(scope), () =>
		Int32Array.from(scopeRows(store, store.citations, scope)),
	);
}

interface PageSums {
	pages: Int32Array;
	count: Float64Array;
	positionSum: Float64Array;
}

/** Mirrors `cited`/`earlier`: each page's citations over the scope. */
function pageSums(store: BrandStore, scope: AnalyticsScope): PageSums {
	return remember(storeIndex(store).sums, JSON.stringify(scope), () => {
		const t = store.citations;
		const n = store.citationPages.length;
		const count = new Float64Array(n);
		const positionSum = new Float64Array(n);
		const seen = new Uint8Array(n);
		for (const i of rowsFor(store, scope)) {
			const p = t.page[i];
			seen[p] = 1;
			count[p] += t.citations[i];
			positionSum[p] += t.positionSum[i];
		}
		const pages: number[] = [];
		for (const p of storeIndex(store).pagesByUrl) if (seen[p]) pages.push(p);
		return { pages: Int32Array.from(pages), count, positionSum };
	});
}

/** Each domain's owner, by domain index: 0 none, 1 the brand, 2 a competitor. */
function ownersFor(store: BrandStore, owned: OwnedDomains): Uint8Array {
	return remember(storeIndex(store).owners, JSON.stringify(owned), () => {
		const ownerOf = ownerResolver(owned);
		return Uint8Array.from(store.bundle.dicts.domains, (domain) => OWNERS.indexOf(ownerOf(domain)));
	});
}

function classify(store: BrandStore, owners: Uint8Array, p: number) {
	const pages = store.citationPages;
	const owner = OWNERS[owners[pages.domain[p]]];
	const category = owner ?? store.bundle.dicts.categories[pages.category[p]];
	const storedType = store.bundle.dicts.pageTypes[pages.pageType[p]];
	const pageType =
		storedType === "other" && CONTENT_PUBLISHER_CATEGORIES.has(category as never) ? "article" : storedType;
	return { category, pageType };
}

interface PageClasses {
	names: { category: string; pageType: string }[];
	code: Uint16Array;
}

function classesFor(store: BrandStore, owned: OwnedDomains): PageClasses {
	return remember(storeIndex(store).classes, JSON.stringify(owned), () => {
		const owners = ownersFor(store, owned);
		const names: PageClasses["names"] = [];
		const codes = new Map<string, number>();
		const code = new Uint16Array(store.citationPages.length);
		for (let p = 0; p < code.length; p++) {
			const resolved = classify(store, owners, p);
			const key = `${resolved.category}|${resolved.pageType}`;
			let c = codes.get(key);
			if (c === undefined) {
				c = names.length;
				codes.set(key, c);
				names.push(resolved);
			}
			code[p] = c;
		}
		return { names, code };
	});
}

/** Mirrors `classifiedPages`: cited pages, Google surfaces aside, in URL order. */
function classifiedPages(store: BrandStore, sums: PageSums, where?: (p: number) => boolean): number[] {
	const { isGoogle } = storeIndex(store);
	const pages: number[] = [];
	for (const p of sums.pages) if (!isGoogle[p] && (!where || where(p))) pages.push(p);
	return pages;
}

/** Stable counting sort by `count` descending, so pages already in URL order come out `count DESC, url`. */
function byCountDesc(pages: number[], count: Float64Array): number[] {
	const buckets = new Map<number, number[]>();
	for (const p of pages) {
		const c = count[p];
		let bucket = buckets.get(c);
		if (!bucket) {
			bucket = [];
			buckets.set(c, bucket);
		}
		bucket.push(p);
	}
	return [...buckets.keys()].sort((a, b) => b - a).flatMap((c) => buckets.get(c) as number[]);
}

const domainOf = (store: BrandStore, p: number) => store.bundle.dicts.domains[store.citationPages.domain[p]];

function searchFilter(store: BrandStore, search: string | undefined) {
	const term = search?.trim().toLowerCase();
	if (!term) return undefined;
	const pages = store.citationPages;
	const domainMatch = Uint8Array.from(store.bundle.dicts.domains, (d) => (d.toLowerCase().includes(term) ? 1 : 0));
	return (p: number) =>
		domainMatch[pages.domain[p]] === 1 ||
		pages.url[p].toLowerCase().includes(term) ||
		(pages.title[p]?.toLowerCase().includes(term) ?? false);
}

/** Mirrors `withPageDetails`: prompts citing each page now, and whether the previous window cited it. */
function withPageDetails(
	store: BrandStore,
	pages: number[],
	sums: PageSums,
	owners: Uint8Array,
	scope: AnalyticsScope,
	previous: AnalyticsScope,
): CitationUrlListRow[] {
	if (pages.length === 0) return [];
	const t = store.citations;
	const wanted = new Map(pages.map((p) => [p, new Set<number>()]));
	for (const i of rowsFor(store, scope)) wanted.get(t.page[i])?.add(t.prompt[i]);
	const earlier = pageSums(store, previous);
	const citedBefore = new Uint8Array(store.citationPages.length);
	for (const p of earlier.pages) citedBefore[p] = 1;
	return pages.map((p) => {
		const prompts = wanted.get(p) as Set<number>;
		const { category, pageType } = classify(store, owners, p);
		return {
			url: store.citationPages.url[p],
			domain: domainOf(store, p),
			title: store.citationPages.title[p],
			category,
			page_type: pageType,
			count: sums.count[p],
			avg_position: avgPosition(sums.positionSum[p], sums.count[p]),
			prompt_count: prompts.size,
			is_new: prompts.size > 0 ? !citedBefore[p] : true,
		};
	});
}

export async function getCitationUrlPage(
	scope: AnalyticsScope,
	previous: AnalyticsScope,
	owned: OwnedDomains,
	filter: CitationUrlFilter,
	limit: number,
	offset: number,
): Promise<{ rows: CitationUrlListRow[]; total: number }> {
	const store = storeFor(scope.brandId);
	const sums = pageSums(store, scope);
	const owners = ownersFor(store, owned);
	const search = searchFilter(store, filter.search);
	const pageClasses = classesFor(store, owned);
	const allowed = Uint8Array.from(pageClasses.names, ({ category, pageType }) =>
		(!filter.category || category === filter.category) && (!filter.pageType || pageType === filter.pageType) ? 1 : 0,
	);
	const matched = classifiedPages(store, sums, (p) => allowed[pageClasses.code[p]] === 1 && (!search || search(p)));
	const page = byCountDesc(matched, sums.count).slice(offset, offset + limit);
	return { rows: withPageDetails(store, page, sums, owners, scope, previous), total: matched.length };
}

interface DomainStat extends CitationDomainStatsRow {
	top_count: number | null;
	top_url: string | null;
}

function domainTops(store: BrandStore, sums: PageSums) {
	const { urlRank } = storeIndex(store);
	const domainCount = store.bundle.dicts.domains.length;
	const pageDomain = store.citationPages.domain;
	const totals = new Float64Array(domainCount);
	const top = new Int32Array(domainCount).fill(-1);
	for (const p of classifiedPages(store, sums)) {
		const d = pageDomain[p];
		totals[d] += sums.count[p];
		const best = top[d];
		const better =
			best < 0 ||
			sums.count[p] > sums.count[best] ||
			(sums.count[p] === sums.count[best] && urlRank[p] < urlRank[best]);
		if (better) top[d] = p;
	}
	return { totals, top };
}

/** Each domain's citations over the previous window, Google surfaces aside; NaN when it had none. */
function domainEarlier(store: BrandStore, earlierSums: PageSums) {
	const { isGoogle } = storeIndex(store);
	const earlier = new Float64Array(store.bundle.dicts.domains.length).fill(Number.NaN);
	for (const p of earlierSums.pages) {
		if (isGoogle[p]) continue;
		const d = store.citationPages.domain[p];
		earlier[d] = (Number.isNaN(earlier[d]) ? 0 : earlier[d]) + earlierSums.count[p];
	}
	return earlier;
}

/** Mirrors `domainStats`: each domain cited in either window, with its most cited page's class and title. */
function domainStats(store: BrandStore, scope: AnalyticsScope, previous: AnalyticsScope, owned: OwnedDomains) {
	const key = JSON.stringify([scope, previous, owned]);
	return remember(storeIndex(store).domainStats, key, () => {
		const sums = pageSums(store, scope);
		const owners = ownersFor(store, owned);
		const { totals, top } = domainTops(store, sums);
		const earlier = domainEarlier(store, pageSums(store, previous));
		const domains: DomainStat[] = [];
		store.bundle.dicts.domains.forEach((domain, d) => {
			const p = top[d];
			const previousCount = Number.isNaN(earlier[d]) ? 0 : earlier[d];
			if (p >= 0) {
				domains.push({
					domain,
					count: totals[d],
					category: classify(store, owners, p).category,
					example_title: store.citationPages.title[p],
					previous_count: previousCount,
					top_count: sums.count[p],
					top_url: store.citationPages.url[p],
				});
			} else if (!Number.isNaN(earlier[d])) {
				domains.push({
					domain,
					count: 0,
					category: null,
					example_title: null,
					previous_count: previousCount,
					top_count: null,
					top_url: null,
				});
			}
		});
		return domains.sort(byDomainOrder);
	});
}

/** `count DESC, top_count DESC, top_url, domain`, with Postgres's NULLS FIRST on DESC and NULLS LAST on ASC. */
function byDomainOrder(a: DomainStat, b: DomainStat) {
	if (b.count !== a.count) return b.count - a.count;
	if (a.top_count !== b.top_count) {
		if (a.top_count === null) return -1;
		if (b.top_count === null) return 1;
		return b.top_count - a.top_count;
	}
	if (a.top_url !== b.top_url) {
		if (a.top_url === null) return 1;
		if (b.top_url === null) return -1;
		return cmp(a.top_url, b.top_url);
	}
	return cmp(a.domain, b.domain);
}

const strip = ({ top_count: _count, top_url: _url, ...row }: DomainStat): CitationDomainStatsRow => row;

export async function getCitationSummary(
	scope: AnalyticsScope,
	previous: AnalyticsScope,
	owned: OwnedDomains,
	options: { minCount: number; limit: number },
): Promise<CitationSummary> {
	const { minCount, limit } = options;
	const store = storeFor(scope.brandId);
	const { urlRank, isGoogle, redditDomain } = storeIndex(store);
	const sums = pageSums(store, scope);
	const earlier = pageSums(store, previous);
	const owners = ownersFor(store, owned);
	const pages = classifiedPages(store, sums);
	const citedBefore = new Uint8Array(store.citationPages.length);
	for (const p of earlier.pages) citedBefore[p] = 1;

	const pageClasses = classesFor(store, owned);
	const classTotals = new Float64Array(pageClasses.names.length);
	const classCited = new Uint8Array(pageClasses.names.length);
	const domainsSeen = new Uint8Array(store.bundle.dicts.domains.length);
	let uniqueDomains = 0;
	for (const p of pages) {
		const c = pageClasses.code[p];
		classCited[c] = 1;
		classTotals[c] += sums.count[p];
		const d = store.citationPages.domain[p];
		if (!domainsSeen[d]) {
			domainsSeen[d] = 1;
			uniqueDomains++;
		}
	}
	const classes: CitationClassTotalRow[] = [];
	pageClasses.names.forEach(({ category, pageType }, c) => {
		if (classCited[c]) classes.push({ category, page_type: pageType, count: classTotals[c] });
	});

	const domains = domainStats(store, scope, previous, owned);

	const newPages = byCountDesc(
		pages.filter((p) => sums.count[p] >= minCount && !citedBefore[p]),
		sums.count,
	).slice(0, limit);

	const droppedUrls: DroppedCitationPageRow[] = [...earlier.pages]
		.filter((p) => earlier.count[p] >= minCount && sums.count[p] * 2 <= earlier.count[p] && !isGoogle[p])
		.sort((a, b) => earlier.count[b] - earlier.count[a] || urlRank[a] - urlRank[b])
		.slice(0, limit)
		.map((p) => ({
			url: store.citationPages.url[p],
			domain: domainOf(store, p),
			static_category: store.bundle.dicts.categories[store.citationPages.category[p]],
			page_type: store.bundle.dicts.pageTypes[store.citationPages.pageType[p]],
			previous_count: earlier.count[p],
			current_count: sums.count[p],
		}));

	const newDomains = domains
		.filter((d) => d.previous_count === 0 && d.count >= minCount)
		.slice(0, limit)
		.map(strip);
	const droppedDomains = domains
		.filter((d) => d.count === 0 && d.previous_count >= minCount)
		.sort((a, b) => b.previous_count - a.previous_count || cmp(a.domain, b.domain))
		.slice(0, limit)
		.map(strip);

	const redditPages: RedditPageRow[] = byCountDesc(
		pages.filter((p) => redditDomain[store.citationPages.domain[p]] === 1),
		sums.count,
	).map((p) => ({
		url: store.citationPages.url[p],
		title: store.citationPages.title[p],
		count: sums.count[p],
		is_new: !citedBefore[p],
	}));

	return {
		classes,
		uniqueDomains,
		newUrls: withPageDetails(store, newPages, sums, owners, scope, previous),
		droppedUrls,
		newDomains,
		droppedDomains,
		redditPages,
	};
}

export async function getCitationDomainPage(
	scope: AnalyticsScope,
	previous: AnalyticsScope,
	owned: OwnedDomains,
	filter: { category?: string; search?: string },
	limit: number,
	offset: number,
): Promise<{ rows: CitationDomainStatsRow[]; total: number }> {
	const store = storeFor(scope.brandId);
	const search = filter.search?.trim().toLowerCase();
	const matched = domainStats(store, scope, previous, owned).filter(
		(row) =>
			row.count > 0 &&
			(!search || row.domain.toLowerCase().includes(search)) &&
			(!filter.category || row.category === filter.category),
	);
	return { rows: matched.slice(offset, offset + limit).map(strip), total: matched.length };
}

export async function getCitationTotals(
	scope: AnalyticsScope,
): Promise<{ citations: number; uniqueDomains: number; uniqueUrls: number }> {
	const store = storeFor(scope.brandId);
	const sums = pageSums(store, scope);
	const { isGoogle } = storeIndex(store);
	let citations = 0;
	let urls = 0;
	const domains = new Set<number>();
	for (const p of sums.pages) {
		if (isGoogle[p]) continue;
		citations += sums.count[p];
		urls++;
		domains.add(store.citationPages.domain[p]);
	}
	return { citations, uniqueDomains: domains.size, uniqueUrls: urls };
}

export async function getDomainPromptCounts(scope: AnalyticsScope, domains: string[]): Promise<Map<string, number>> {
	if (domains.length === 0) return new Map();
	const store = storeFor(scope.brandId);
	const wanted = new Map<number, Set<number>>();
	for (const domain of domains) {
		const d = store.bundle.dicts.domains.indexOf(domain);
		if (d >= 0) wanted.set(d, new Set());
	}
	const t = store.citations;
	const pageDomain = store.citationPages.domain;
	for (const i of rowsFor(store, scope)) wanted.get(pageDomain[t.page[i]])?.add(t.prompt[i]);
	return new Map(
		[...wanted].filter(([, set]) => set.size > 0).map(([d, set]) => [store.bundle.dicts.domains[d], set.size]),
	);
}

export async function getCitationFlowRows(scope: AnalyticsScope, domain: string): Promise<CitationFlowRow[]> {
	const store = storeFor(scope.brandId);
	const { isGoogle } = storeIndex(store);
	const t = store.citations;
	const suffix = `.${domain}`;
	const matches = Uint8Array.from(store.bundle.dicts.domains, (d) => (d === domain || d.endsWith(suffix) ? 1 : 0));
	const pageDomain = store.citationPages.domain;
	const pageCount = store.citationPages.length;
	const groups = new Map<number, CitationFlowRow>();
	for (const i of rowsFor(store, scope)) {
		const p = t.page[i];
		if (!matches[pageDomain[p]] || isGoogle[p]) continue;
		const key = t.model[i] * pageCount + p;
		let row = groups.get(key);
		if (!row) {
			row = {
				model: store.bundle.dicts.models[t.model[i]],
				url: store.citationPages.url[p],
				title: store.citationPages.title[p],
				count: 0,
			};
			groups.set(key, row);
		}
		row.count += t.citations[i];
	}
	return [...groups.values()].sort((a, b) => b.count - a.count || cmp(a.url, b.url) || cmp(a.model, b.model));
}
