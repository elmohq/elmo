import { createHash } from "node:crypto";
import type { Brand, Competitor } from "./db/schema";

/**
 * The fallback matcher, for workers without the bundled mention judge: case-insensitive
 * substring matching over a subject's names and bare domains. Blunt on purpose, so it
 * never misses the "acme.com is the pick here" and "Acme's" shapes, at the cost of
 * counting a brand whose name is also an ordinary word every time the word appears.
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

export interface MentionConfig {
	brand: { name: string; aliases: string[]; domains: string[] };
	competitors: { name: string; aliases: string[]; domains: string[] }[];
}

export function mentionConfigFrom(brand: Brand, competitors: Competitor[]): MentionConfig {
	return {
		brand: {
			name: brand.name,
			aliases: brand.aliases ?? [],
			domains: [brand.website, ...(brand.additionalDomains ?? [])],
		},
		competitors: competitors.map((competitor) => ({
			name: competitor.name,
			aliases: competitor.aliases ?? [],
			domains: competitor.domains ?? [],
		})),
	};
}

/** The mention judge's verdict on one subject, for the answers that name it. */
export interface MentionAssessmentRecord {
	/** `uncertain` counts as a mention but wants a human to look. */
	mention: "mentioned" | "not_mentioned" | "uncertain";
	probability: number;
	/** The likeliest non-mention reading, when it isn't a confident mention. */
	reason?: string;
	sentiment?: "positive" | "neutral" | "negative" | "mixed" | "uncertain";
	sentimentProbabilities?: Record<string, number>;
	/** Offsets into the run's stored text of the passage the verdict rests on. */
	evidence?: { start: number; end: number };
}

export interface RunMentionAssessments {
	brand?: MentionAssessmentRecord;
	/** Keyed by competitor name, as in `competitors_mentioned`. */
	competitors?: Record<string, MentionAssessmentRecord>;
}

export function analyzeRunMentions(
	textContent: string | null,
	config: MentionConfig,
): { brandMentioned: boolean; competitorsMentioned: string[] } {
	return analyzeMentions(textContent ?? "", config.brand, config.competitors);
}

/** Matching trims, ignores case and skips empty terms, so the stamp does too. */
function canonicalTerms(terms: readonly string[]): string[] {
	return [...new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean))].sort();
}

function canonicalDomains(domains: readonly string[]): string[] {
	return canonicalTerms(domains.filter(Boolean).map((domain) => normalizeDomain(domain)));
}

/**
 * Identifies the matcher version and brand config a run's mentions were derived
 * from. Configs that match the same text stamp alike, so reordering competitors
 * or recasing an alias doesn't reprocess a brand's whole history. Competitor
 * names are the exception: they're stored verbatim in `competitors_mentioned`
 * and key the rollups, so a rename must restamp even when only case or whitespace changed.
 * A judged stamp names the judge, so a new model replays every brand's history.
 */
export function mentionsStamp(config: MentionConfig, judgeVersion?: string | null): string {
	const fingerprint = JSON.stringify({
		names: canonicalTerms([config.brand.name, ...config.brand.aliases]),
		domains: canonicalDomains(config.brand.domains),
		competitors: config.competitors
			.map((competitor) =>
				JSON.stringify({
					name: competitor.name,
					aliases: canonicalTerms(competitor.aliases),
					domains: canonicalDomains(competitor.domains),
				}),
			)
			.sort(),
	});
	const digest = createHash("sha256").update(fingerprint).digest("hex");
	const stamp = `${MENTIONS_VERSION}:${digest.slice(0, 16)}`;
	return judgeVersion ? `${stamp}:judge-${judgeVersion}` : stamp;
}
