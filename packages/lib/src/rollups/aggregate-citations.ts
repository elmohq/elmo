import { isGoogleSurfaceUrl, normalizeUrl } from "../citations/domain-categories";
import { categorizeDomain } from "../citations/domain-lists";
import { classifyPage, GOOGLE_STATIC_CATEGORY } from "../citations/page-classification";
import { bucketStart } from "./bucket";
import { CLASSIFIER_VERSION } from "./constants";

const NO_DOMAINS: Set<string> = new Set();

export interface CitationSourceRow {
	brandId: string;
	promptId: string;
	createdAt: Date;
	model: string;
	provider: string | null;
	webSearchEnabled: boolean;
	url: string;
	domain: string;
	title: string | null;
	citationIndex: number | null;
}

export interface PageUpsert {
	url: string;
	domain: string;
	title: string | null;
	pageType: string;
	staticCategory: string;
	classifierVersion: number;
	firstSeenAt: Date;
	lastSeenAt: Date;
}

export interface UrlRollupRow {
	brandId: string;
	bucket: Date;
	promptId: string;
	model: string;
	provider: string;
	webSearchEnabled: boolean;
	url: string;
	domain: string;
	staticCategory: string;
	pageType: string;
	citations: number;
	positionSum: number;
	positionCount: number;
}

export interface DomainRollupRow {
	brandId: string;
	bucket: Date;
	promptId: string;
	model: string;
	provider: string;
	webSearchEnabled: boolean;
	domain: string;
	staticCategory: string;
	citations: number;
}

export interface AggregatedCitations {
	pages: PageUpsert[];
	urls: UrlRollupRow[];
	domains: DomainRollupRow[];
}

interface NormalizedRow {
	brandId: string;
	bucket: Date;
	promptId: string;
	model: string;
	provider: string;
	webSearchEnabled: boolean;
	url: string;
	domain: string;
	title: string | null;
	citationIndex: number | null;
	createdAt: Date;
}

interface UrlGroup {
	row: NormalizedRow;
	citations: number;
	positionSum: number;
	positionCount: number;
	title: string | null;
}

interface DomainGroup {
	row: NormalizedRow;
	citations: number;
	google: boolean;
}

interface PageGroup {
	url: string;
	domain: string;
	title: string | null;
	firstSeenAt: Date;
	lastSeenAt: Date;
}

const blankToNull = (value: string | null): string | null => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
};

function normalizeRow(row: CitationSourceRow): NormalizedRow {
	return {
		brandId: row.brandId,
		bucket: bucketStart(row.createdAt),
		promptId: row.promptId,
		model: row.model,
		provider: row.provider ?? "",
		webSearchEnabled: row.webSearchEnabled,
		url: normalizeUrl(row.url),
		domain: row.domain,
		title: blankToNull(row.title),
		citationIndex: row.citationIndex,
		createdAt: row.createdAt,
	};
}

const rollupKey = (row: NormalizedRow): string =>
	[row.brandId, row.bucket.getTime(), row.promptId, row.model, row.provider, row.webSearchEnabled].join("\u0000");

const compareStrings = (a: string, b: string): number => (a < b ? -1 : Number(a > b));

/**
 * Folding is order-dependent — the newest title of a URL wins — so rows are put
 * in one canonical order first and the last writer wins from there.
 */
function sortRows(rows: NormalizedRow[]): NormalizedRow[] {
	return rows.sort(
		(a, b) =>
			a.createdAt.getTime() - b.createdAt.getTime() ||
			compareStrings(a.url, b.url) ||
			compareStrings(a.title ?? "", b.title ?? ""),
	);
}

function foldUrls(rows: NormalizedRow[]): Map<string, UrlGroup> {
	const groups = new Map<string, UrlGroup>();
	for (const row of rows) {
		const key = `${rollupKey(row)}\u0000${row.url}`;
		const group = groups.get(key) ?? { row, citations: 0, positionSum: 0, positionCount: 0, title: null };
		group.citations += 1;
		if (row.citationIndex != null) {
			group.positionSum += row.citationIndex;
			group.positionCount += 1;
		}
		if (row.title) group.title = row.title;
		groups.set(key, group);
	}
	return groups;
}

function foldDomains(rows: NormalizedRow[]): Map<string, DomainGroup> {
	const groups = new Map<string, DomainGroup>();
	for (const row of rows) {
		const key = `${rollupKey(row)}\u0000${row.domain}`;
		const group = groups.get(key) ?? { row, citations: 0, google: false };
		group.citations += 1;
		// One row per domain, so a domain that serves both search surfaces and
		// ordinary pages counts as a Google surface and stays out of the mix.
		group.google ||= isGoogleSurfaceUrl(row.url);
		groups.set(key, group);
	}
	return groups;
}

function foldPages(rows: NormalizedRow[]): Map<string, PageGroup> {
	const pages = new Map<string, PageGroup>();
	for (const row of rows) {
		const page = pages.get(row.url);
		if (!page) {
			pages.set(row.url, {
				url: row.url,
				domain: row.domain,
				title: row.title,
				firstSeenAt: row.createdAt,
				lastSeenAt: row.createdAt,
			});
			continue;
		}
		if (row.title) page.title = row.title;
		if (row.createdAt < page.firstSeenAt) page.firstSeenAt = row.createdAt;
		if (row.createdAt > page.lastSeenAt) page.lastSeenAt = row.createdAt;
	}
	return pages;
}

function toPages(pages: Map<string, PageGroup>): PageUpsert[] {
	return Array.from(pages.values())
		.map((page) => ({
			url: page.url,
			domain: page.domain,
			title: page.title,
			...classifyPage(page.url, page.domain, page.title),
			classifierVersion: CLASSIFIER_VERSION,
			firstSeenAt: page.firstSeenAt,
			lastSeenAt: page.lastSeenAt,
		}))
		.sort((a, b) => compareStrings(a.url, b.url));
}

function toUrlRows(groups: Map<string, UrlGroup>): UrlRollupRow[] {
	return Array.from(groups.values())
		.map(({ row, citations, positionSum, positionCount, title }) => ({
			brandId: row.brandId,
			bucket: row.bucket,
			promptId: row.promptId,
			model: row.model,
			provider: row.provider,
			webSearchEnabled: row.webSearchEnabled,
			url: row.url,
			domain: row.domain,
			...classifyPage(row.url, row.domain, title),
			citations,
			positionSum,
			positionCount,
		}))
		.sort((a, b) => compareRollupKeys(a, b) || compareStrings(a.url, b.url));
}

function toDomainRows(groups: Map<string, DomainGroup>): DomainRollupRow[] {
	return Array.from(groups.values())
		.map(({ row, citations, google }) => ({
			brandId: row.brandId,
			bucket: row.bucket,
			promptId: row.promptId,
			model: row.model,
			provider: row.provider,
			webSearchEnabled: row.webSearchEnabled,
			domain: row.domain,
			staticCategory: google ? GOOGLE_STATIC_CATEGORY : categorizeDomain(row.domain, NO_DOMAINS, NO_DOMAINS),
			citations,
		}))
		.sort((a, b) => compareRollupKeys(a, b) || compareStrings(a.domain, b.domain));
}

type RollupKeyFields = Pick<
	UrlRollupRow,
	"brandId" | "bucket" | "promptId" | "model" | "provider" | "webSearchEnabled"
>;

function compareRollupKeys(a: RollupKeyFields, b: RollupKeyFields): number {
	return (
		compareStrings(a.brandId, b.brandId) ||
		a.bucket.getTime() - b.bucket.getTime() ||
		compareStrings(a.promptId, b.promptId) ||
		compareStrings(a.model, b.model) ||
		compareStrings(a.provider, b.provider) ||
		Number(a.webSearchEnabled) - Number(b.webSearchEnabled)
	);
}

/**
 * Citation rows for a range, folded into the three shapes the rollup stores.
 * Rows may span buckets; the bucket is part of every key.
 */
export function aggregateCitationBucket(rows: CitationSourceRow[]): AggregatedCitations {
	const normalized = sortRows(rows.map(normalizeRow));
	return {
		pages: toPages(foldPages(normalized)),
		urls: toUrlRows(foldUrls(normalized)),
		domains: toDomainRows(foldDomains(normalized)),
	};
}
