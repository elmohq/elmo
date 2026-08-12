/**
 * Rolling raw citation rows up into the shape both citation views render.
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
	type CitationCategory,
	CITATION_PAGE_TYPES,
	type CitationPageType,
	emptyCategoryCounts,
	emptyPageTypeCounts,
	isGoogleSurfaceUrl,
	normalizeUrl,
	resolvePageType,
} from "@/lib/domain-categories";
import { isMarketplaceDomain } from "@/lib/marketplace-domains";

/** The row shape both callers read out of postgres-read. */
export interface CitationUrlRow {
	url: string;
	domain: string;
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
	/** Mean position across the citations that reported one; null when none did. */
	avgPosition: number | null;
}

export interface CitationDomain {
	domain: string;
	count: number;
	category: CitationCategory;
	exampleTitle?: string;
	/** Listed on a pay-to-win link marketplace; orthogonal to `category`. */
	isMarketplace: boolean;
}

export interface CitationTallies {
	categoryCounts: Record<CitationCategory, number>;
	pageTypeCounts: Record<CitationPageType, number>;
	totalCitations: number;
	/** Page types that actually occur, so a chart has no empty slices. */
	pageTypeDistribution: { pageType: CitationPageType; count: number }[];
}

/**
 * One entry per distinct URL, classified and sorted by citation count.
 *
 * URLs are folded on their normalized form before classification: the same page
 * cited with and without a tracking parameter is one source, and averaging
 * positions across the pre-normalized rows would weight it twice.
 */
export function rollUpCitationUrls(
	rows: CitationUrlRow[],
	classify: (domain: string, url: string, title?: string) => CitationCategory,
): CitationUrl[] {
	const folded = new Map<
		string,
		{ count: number; title?: string; domain: string; positionSum: number; positionCount: number }
	>();

	for (const { url, domain, title, count, avg_position } of rows) {
		if (isGoogleSurfaceUrl(url)) continue;
		const normalized = normalizeUrl(url);
		const c = Number(count);
		// A row with no reported position contributes to the count but not the
		// average, so the two are summed separately.
		const positionSum = avg_position != null ? Number(avg_position) * c : 0;
		const positionCount = avg_position != null ? c : 0;
		const existing = folded.get(normalized);
		if (existing) {
			existing.count += c;
			existing.positionSum += positionSum;
			existing.positionCount += positionCount;
			if (!existing.title && title) existing.title = title;
		} else {
			folded.set(normalized, { count: c, title: title || undefined, domain, positionSum, positionCount });
		}
	}

	return Array.from(folded.entries())
		.map(([url, { count, title, domain, positionSum, positionCount }]) => {
			const category = classify(domain, url, title);
			return {
				url,
				title,
				domain,
				count,
				category,
				pageType: resolvePageType(url, title, category),
				avgPosition: positionCount > 0 ? Math.round((positionSum / positionCount) * 10) / 10 : null,
			};
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
				isMarketplace: isMarketplaceDomain(url.domain),
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
