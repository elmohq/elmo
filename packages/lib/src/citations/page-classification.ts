import {
	type CitationCategory,
	type CitationPageType,
	CONTENT_PUBLISHER_CATEGORIES,
	inDomainSet,
	inferPageType,
	isGoogleSurfaceUrl,
} from "./domain-categories";
import { classifyUrl } from "./domain-lists";

/**
 * Stored so reads can pull Google surfaces out of the source mix, where they'd
 * otherwise be counted twice. Deliberately not in `CITATION_CATEGORIES`.
 */
export const GOOGLE_STATIC_CATEGORY = "google";

export type StaticCategory = CitationCategory | typeof GOOGLE_STATIC_CATEGORY;

export interface PageClassification {
	pageType: CitationPageType;
	staticCategory: StaticCategory;
}

const NO_DOMAINS: Set<string> = new Set();

/**
 * Write-time classification. Brand and competitor domains are left out because
 * they differ per tenant; `resolvePageClass` applies them when rows are read.
 */
export function classifyPage(url: string, domain: string, title: string | null): PageClassification {
	const pageType = inferPageType(url, title);
	if (isGoogleSurfaceUrl(url)) return { pageType, staticCategory: GOOGLE_STATIC_CATEGORY };
	return { pageType, staticCategory: classifyUrl(domain, url, title, NO_DOMAINS, NO_DOMAINS) };
}

export interface StoredPageClass {
	domain: string;
	static_category: string;
	page_type: string;
}

export interface ResolvedPageClass {
	category: CitationCategory;
	pageType: CitationPageType;
}

/**
 * Must answer what `classifyUrl` + `resolvePageType` would for this brand: the
 * article fallback runs on the overridden category, and Google surfaces resolve
 * to null because the raw path drops them by URL before classifying.
 */
export function resolvePageClass(
	row: StoredPageClass,
	brandDomains: Set<string>,
	competitorDomains: Set<string>,
): ResolvedPageClass | null {
	if (row.static_category === GOOGLE_STATIC_CATEGORY) return null;
	const category = inDomainSet(row.domain, brandDomains)
		? "brand"
		: inDomainSet(row.domain, competitorDomains)
			? "competitor"
			: (row.static_category as CitationCategory);
	const storedPageType = row.page_type as CitationPageType;
	const pageType =
		storedPageType === "other" && CONTENT_PUBLISHER_CATEGORIES.has(category) ? "article" : storedPageType;
	return { category, pageType };
}
