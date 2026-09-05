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
 * Google search and shopping surfaces get their own stored category so reads
 * can pull them out of the source mix — they are rendered as their own module
 * and would otherwise be counted twice. It is deliberately outside
 * `CITATION_CATEGORIES`: it is a storage concern, not a source category.
 */
export const GOOGLE_STATIC_CATEGORY = "google";

export type StaticCategory = CitationCategory | typeof GOOGLE_STATIC_CATEGORY;

/** The tenant-independent half of a page's classification, stored once per URL. */
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
 * Read-time counterpart of `classifyPage`: what `classifyUrl` and
 * `resolvePageType` would answer for one brand, reconstructed from the stored
 * pair without the URL or title. The brand/competitor override comes first, as
 * in `classifyUrl`, and the content-publisher article fallback runs on the
 * category that override produced. Google surfaces resolve to null: the raw
 * path drops them by URL before it ever classifies.
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
