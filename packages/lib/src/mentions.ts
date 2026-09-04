/**
 * Detection is deliberately blunt — case-insensitive substring matching over a
 * subject's names and bare domains — because an answer engine writes prose, not
 * markup, and any narrower rule (word boundaries, link parsing) misses the
 * "acme.com is the pick here" and "Acme's" shapes that are the whole signal.
 */

export const MENTIONS_VERSION = 1;

export interface MentionSubject {
	name: string;
	aliases?: string[] | null;
	domains?: (string | null | undefined)[] | null;
}

/** Malformed input falls back to the raw value: a stored typo shouldn't fail a run. */
export function normalizeDomain(urlOrDomain: string): string {
	try {
		const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return urlOrDomain.replace(/^www\./, "").toLowerCase();
	}
}

/** A blank term is contained in every answer, so it has to match nothing instead. */
function containsTerm(contentLower: string, term: string | null | undefined): boolean {
	const needle = term?.trim().toLowerCase();
	return !!needle && contentLower.includes(needle);
}

export function mentionsSubject(contentLower: string, subject: MentionSubject): boolean {
	const names = [subject.name, ...(subject.aliases ?? [])];
	if (names.some((name) => containsTerm(contentLower, name))) return true;
	return (subject.domains ?? []).some(
		(domain) => domain != null && containsTerm(contentLower, normalizeDomain(domain)),
	);
}

export function analyzeMentions(
	content: string,
	brand: MentionSubject,
	competitors: readonly MentionSubject[],
): { brandMentioned: boolean; competitorsMentioned: string[] } {
	const contentLower = content.toLowerCase();
	return {
		brandMentioned: mentionsSubject(contentLower, brand),
		competitorsMentioned: competitors
			.filter((competitor) => mentionsSubject(contentLower, competitor))
			.map((competitor) => competitor.name),
	};
}
