/**
 * Whether an answer names a brand or its competitors.
 *
 * Detection is deliberately blunt — case-insensitive substring matching over a
 * subject's names and bare domains — because an answer engine writes prose, not
 * markup, and any narrower rule (word boundaries, link parsing) misses the
 * "acme.com is the pick here" and "Acme's" shapes that are the whole signal.
 * Aliases exist to widen the same rule to the names a brand is also known by.
 */

/** A brand or competitor, as much of it as mention detection needs. */
export interface MentionSubject {
	name: string;
	aliases?: string[] | null;
	/** Sites that stand for the subject, as URLs or bare domains. */
	domains?: (string | null | undefined)[] | null;
}

/**
 * A URL or bare domain reduced to a comparable host. Malformed input falls back
 * to the raw value: a subject with an unparseable domain still matches on its
 * name, and a stored typo shouldn't fail a run.
 */
export function normalizeDomain(urlOrDomain: string): string {
	try {
		const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return urlOrDomain.replace(/^www\./, "").toLowerCase();
	}
}

/** Whether already-lowercased content names the subject or one of its sites. */
export function mentionsSubject(contentLower: string, subject: MentionSubject): boolean {
	const names = [subject.name, ...(subject.aliases ?? [])];
	if (names.some((name) => name && contentLower.includes(name.toLowerCase()))) return true;
	return (subject.domains ?? []).some((domain) => domain && contentLower.includes(normalizeDomain(domain)));
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
