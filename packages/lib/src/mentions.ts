/**
 * Whether an answer mentions the tracked brand or its competitors, by simple
 * substring match on names, aliases, and domains. Shared by the worker's normal
 * run path and any script that persists a prompt run, so both label a given
 * answer identically.
 */
import type { Brand, Competitor } from "./db/schema";

function extractDomainFromUrl(urlOrDomain: string): string {
	try {
		const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return urlOrDomain.replace(/^www\./, "").toLowerCase();
	}
}

export function analyzeMentions(
	content: string,
	brand: Brand,
	competitorsList: Competitor[],
): {
	brandMentioned: boolean;
	competitorsMentioned: string[];
} {
	const contentLower = content.toLowerCase();

	const brandNames = [brand.name, ...(brand.aliases || [])].map((n) => n.toLowerCase());
	const brandDomains = [
		extractDomainFromUrl(brand.website),
		...(brand.additionalDomains || []).map(extractDomainFromUrl),
	];
	const brandMentioned =
		brandNames.some((n) => contentLower.includes(n)) || brandDomains.some((d) => contentLower.includes(d));

	const competitorsMentioned = competitorsList
		.filter((competitor) => {
			const names = [competitor.name, ...(competitor.aliases || [])].map((n) => n.toLowerCase());
			const nameMatch = names.some((n) => contentLower.includes(n));
			const domainMatch = (competitor.domains || []).some((d) => contentLower.includes(extractDomainFromUrl(d)));
			return nameMatch || domainMatch;
		})
		.map((competitor) => competitor.name);

	return { brandMentioned, competitorsMentioned };
}
