/**
 * Turning per-URL citation rows into the shape both citation views render.
 *
 * The brand-wide view (server/citations.ts) and the single-prompt view
 * (server/prompts.ts) ask the same three questions of the same rows — which
 * URLs, which domains, which categories — and only differ in what they hang off
 * the answers (period-over-period deltas brand-wide, nothing per prompt). The
 * questions live here so the two views cannot answer them differently; the
 * decorations stay with their callers.
 *
 * Google surfaces are dropped throughout: they are pulled into their own module
 * by buildGoogleModule and would otherwise be double-counted in the source mix.
 */
import {
	CITATION_PAGE_TYPES,
	type CitationCategory,
	type CitationPageType,
	emptyCategoryCounts,
	emptyPageTypeCounts,
} from "./domain-categories";
import { resolvePageClass, type StoredPageClass } from "./page-classification";

/** One row per page (normalized URL) with its stored classification, as rollup-read returns them. */
export interface CitationUrlRow extends StoredPageClass {
	url: string;
	title: string | null;
	count: number;
	avg_position: number | null;
}

export interface CitationUrl {
	url: string;
	title?: string;
	domain: string;
	count: number;
	category: CitationCategory;
	pageType: CitationPageType;
	avgPosition: number | null;
}

export interface CitationDomain {
	domain: string;
	count: number;
	category: CitationCategory;
	exampleTitle?: string;
}

export interface CitationTallies {
	categoryCounts: Record<CitationCategory, number>;
	pageTypeCounts: Record<CitationPageType, number>;
	totalCitations: number;
	/** Page types that actually occur, so a chart has no empty slices. */
	pageTypeDistribution: { pageType: CitationPageType; count: number }[];
}

/** Each page classified for this brand, most cited first. */
export function rollUpCitationUrls(
	rows: CitationUrlRow[],
	brandDomains: Set<string>,
	competitorDomains: Set<string>,
): CitationUrl[] {
	return rows
		.flatMap((row) => {
			const resolved = resolvePageClass(row, brandDomains, competitorDomains);
			if (!resolved) return [];
			return [
				{
					url: row.url,
					title: row.title ?? undefined,
					domain: row.domain,
					count: Number(row.count),
					category: resolved.category,
					pageType: resolved.pageType,
					avgPosition: row.avg_position,
				},
			];
		})
		.sort((a, b) => b.count - a.count);
}

/**
 * Domains, rebuilt from the URL-level data rather than counted separately, each
 * taking its category from its most-cited URL — so a domain that is mostly
 * review articles reads as editorial rather than falling to "other".
 */
export function rollUpCitationDomains(urls: CitationUrl[]): CitationDomain[] {
	const byDomain = new Map<string, CitationDomain & { topCount: number }>();
	for (const url of urls) {
		const current = byDomain.get(url.domain);
		if (!current) {
			byDomain.set(url.domain, {
				domain: url.domain,
				count: url.count,
				category: url.category,
				exampleTitle: url.title,
				topCount: url.count,
			});
			continue;
		}
		current.count += url.count;
		if (url.count > current.topCount) {
			current.topCount = url.count;
			current.category = url.category;
			current.exampleTitle = url.title;
		}
	}
	return Array.from(byDomain.values())
		.map(({ topCount: _topCount, ...domain }) => domain)
		.sort((a, b) => b.count - a.count);
}

/** Category and page-type totals, taken from the URL-level classification. */
export function tallyCitations(urls: CitationUrl[]): CitationTallies {
	const categoryCounts = emptyCategoryCounts();
	const pageTypeCounts = emptyPageTypeCounts();
	let totalCitations = 0;
	for (const url of urls) {
		categoryCounts[url.category] += url.count;
		pageTypeCounts[url.pageType] += url.count;
		totalCitations += url.count;
	}
	return {
		categoryCounts,
		pageTypeCounts,
		totalCitations,
		pageTypeDistribution: CITATION_PAGE_TYPES.map((pageType) => ({ pageType, count: pageTypeCounts[pageType] })).filter(
			(entry) => entry.count > 0,
		),
	};
}
