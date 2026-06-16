/**
 * Brand & competitor mention detection.
 *
 * Case-insensitive substring matching of a brand (its name, aliases, website,
 * and additional domains) and competitors (name, aliases, domains) against a
 * model's response text. This is the single source of truth shared by the
 * worker's day-to-day prompt processing, the report worker, and the CLI's
 * `elmo lab eval` command — keep all callers on this function so mention/SoV
 * numbers stay identical across surfaces.
 *
 * The inputs are intentionally minimal structural shapes (not DB row types) so
 * non-DB callers like the CLI can use them without importing the schema.
 */

export interface MentionBrand {
	name: string;
	/** Primary website/hostname (with or without protocol). Optional. */
	website?: string;
	/** Other names users call the brand (abbreviations, parent company, etc.). */
	aliases?: string[] | null;
	/** Other hostnames the brand owns. */
	additionalDomains?: string[] | null;
}

export interface MentionCompetitor {
	name: string;
	/** Hostnames owned by the competitor (with or without protocol). */
	domains?: string[] | null;
	aliases?: string[] | null;
}

/** Normalize a URL or bare hostname to a lowercase host with `www.` stripped. */
export function extractDomainFromUrl(urlOrDomain: string): string {
	try {
		const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return urlOrDomain.replace(/^www\./, "").toLowerCase();
	}
}

export function analyzeMentions(
	content: string,
	brand: MentionBrand,
	competitorsList: MentionCompetitor[],
): {
	brandMentioned: boolean;
	competitorsMentioned: string[];
} {
	const contentLower = content.toLowerCase();

	const brandNames = [brand.name, ...(brand.aliases ?? [])].map((n) => n.toLowerCase());
	const brandDomains = [
		...(brand.website ? [extractDomainFromUrl(brand.website)] : []),
		...(brand.additionalDomains ?? []).map(extractDomainFromUrl),
	];
	const brandMentioned =
		brandNames.some((n) => n && contentLower.includes(n)) || brandDomains.some((d) => d && contentLower.includes(d));

	const competitorsMentioned = competitorsList
		.filter((competitor) => {
			const names = [competitor.name, ...(competitor.aliases ?? [])].map((n) => n.toLowerCase());
			const nameMatch = names.some((n) => n && contentLower.includes(n));
			const domainMatch = (competitor.domains ?? []).some((d) => {
				const domain = extractDomainFromUrl(d);
				return domain && contentLower.includes(domain);
			});
			return nameMatch || domainMatch;
		})
		.map((competitor) => competitor.name);

	return { brandMentioned, competitorsMentioned };
}
