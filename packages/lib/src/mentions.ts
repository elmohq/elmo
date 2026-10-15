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

/** `uncertain` still counts as a mention. */
export type MentionVerdict = "mentioned" | "not_mentioned" | "uncertain";
export type SentimentVerdict = "positive" | "neutral" | "negative" | "mixed" | "uncertain";
/** The judge's readings of a name that aren't a mention of the company. */
export type NonMentionReason = "other_meaning" | "other_company" | "no_info";

/** The mention judge's verdict on one subject, for the answers that name it. */
export interface MentionAssessmentRecord {
	mention: MentionVerdict;
	probability: number;
	/** The likeliest non-mention reading, when it isn't a confident mention. */
	reason?: NonMentionReason;
	sentiment?: SentimentVerdict;
	sentimentProbabilities?: Record<string, number>;
	/**
	 * Offsets into the run's stored text of the passage the verdict rests on: the one that most
	 * carries its sentiment when it has one, otherwise the one that most decided the mention.
	 */
	evidence?: { start: number; end: number };
	/** For a verdict that counts: offset into the run's stored text of the first mention. */
	firstMention?: number;
	/** For a verdict that counts: how many times the answer mentions the subject. */
	mentionCount?: number;
	/**
	 * For a verdict that counts: 1 for the tracked company the answer names first, 2 for the next,
	 * and so on. Only tracked companies are ranked; others the answer names are not known.
	 */
	position?: number;
}

export interface RunMentionAssessments {
	/** Absent when the answer never names the brand. */
	brand?: MentionAssessmentRecord;
	/** Keyed by competitor name, as in `competitors_mentioned`; only competitors the answer names. */
	competitors: Record<string, MentionAssessmentRecord>;
	/**
	 * The `subjectFingerprint` each subject was judged under, including subjects the answer never
	 * names. A replay re-judges only the subjects whose fingerprint has changed.
	 */
	judged: { brand: string; competitors: Record<string, string> };
}

type Subject = MentionConfig["brand"];

/**
 * A subject as the judge reads it. Case is kept: unlike substring matching, the model sees the
 * names as written, so recasing one is a different input.
 */
export function judgedSubject(subject: Subject): Subject {
	const present = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);
	return {
		name: subject.name.trim(),
		aliases: present(subject.aliases),
		domains: present(subject.domains).map(normalizeDomain),
	};
}

/**
 * What a subject's verdicts depend on: the subject as judged, and the judge. Rival names are left
 * out on purpose, so adding a competitor re-judges only that competitor rather than every subject
 * whose list of rivals it joined; those rivals are context for the model, not what it decides.
 */
export function subjectFingerprint(subject: Subject, judgeVersion: string): string {
	return digest({ ...judgedSubject(subject), judgeVersion });
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

/** A term inside a longer word ("ace" in "place") is never the subject, so only whole words match. */
export function wholeWordPattern(term: string): RegExp {
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
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
 * Identifies the matcher and brand config a run's mentions were derived from; `judgeVersion` is
 * null for substring matching. Substring configs that match the same text stamp alike, so
 * reordering competitors or recasing an alias doesn't reprocess a brand's whole history.
 * Competitor names are the exception: they're stored verbatim in `competitors_mentioned` and key
 * the rollups, so a rename must restamp even when only case or whitespace changed. A judged stamp
 * is made of each subject's fingerprint, so it changes exactly when some subject must be re-judged.
 */
export function mentionsStamp(config: MentionConfig, judgeVersion: string | null): string {
	if (judgeVersion) {
		const subjects = digest({
			brand: subjectFingerprint(config.brand, judgeVersion),
			competitors: config.competitors.map((c) => [c.name, subjectFingerprint(c, judgeVersion)]).sort(),
		});
		return `${MENTIONS_VERSION}:${subjects}:judge-${judgeVersion}`;
	}
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
	return `${MENTIONS_VERSION}:${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`;
}
