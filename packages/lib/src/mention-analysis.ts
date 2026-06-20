/**
 * Shared brand/competitor mention analysis.
 *
 * Used by the worker at write time (process-prompt), by the reanalyze-brand
 * job when brand settings change, and by any future backfills — so all paths
 * agree on what counts as a "mention".
 *
 * Names (brand name, aliases, competitor names) are matched on word
 * boundaries so a brand named "Box" doesn't match "toolbox". Domains keep
 * substring semantics — "box.com" is an unambiguous token.
 */

export interface BrandMentionTarget {
	name: string;
	website: string;
	aliases?: string[] | null;
	additionalDomains?: string[] | null;
}

export interface CompetitorMentionTarget {
	name: string;
	aliases?: string[] | null;
	domains?: string[] | null;
}

export interface MentionAnalysis {
	brandMentioned: boolean;
	competitorsMentioned: string[];
}

/**
 * Normalize a URL or bare domain to a lowercase hostname without "www.".
 */
export function extractDomainFromUrl(urlOrDomain: string): string {
	try {
		const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return urlOrDomain.replace(/^www\./, "").toLowerCase();
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive word-boundary match: the name must not be embedded inside
 * a longer word ("Box" matches "Box is great" and "(box)" but not "toolbox").
 * Uses \W instead of \b so names that start/end with non-word characters
 * (e.g. "C++") still match correctly.
 */
export function mentionsName(content: string, name: string): boolean {
	const trimmed = name.trim();
	if (!trimmed) return false;
	const pattern = new RegExp(`(^|\\W)${escapeRegExp(trimmed)}(\\W|$)`, "i");
	return pattern.test(content);
}

function mentionsAnyName(content: string, names: (string | null | undefined)[]): boolean {
	return names.some((name) => typeof name === "string" && mentionsName(content, name));
}

function mentionsAnyDomain(contentLower: string, domains: (string | null | undefined)[]): boolean {
	return domains.some((domain) => {
		if (typeof domain !== "string" || !domain.trim()) return false;
		return contentLower.includes(extractDomainFromUrl(domain));
	});
}

/**
 * Determine whether the brand (and which competitors) are mentioned in a
 * response text.
 */
export function analyzeMentions(
	content: string,
	brand: BrandMentionTarget,
	competitors: CompetitorMentionTarget[],
): MentionAnalysis {
	if (!content) {
		return { brandMentioned: false, competitorsMentioned: [] };
	}

	const contentLower = content.toLowerCase();

	const brandMentioned =
		mentionsAnyName(content, [brand.name, ...(brand.aliases || [])]) ||
		mentionsAnyDomain(contentLower, [brand.website, ...(brand.additionalDomains || [])]);

	const competitorsMentioned = competitors
		.filter(
			(competitor) =>
				mentionsAnyName(content, [competitor.name, ...(competitor.aliases || [])]) ||
				mentionsAnyDomain(contentLower, competitor.domains || []),
		)
		.map((competitor) => competitor.name);

	return { brandMentioned, competitorsMentioned };
}
