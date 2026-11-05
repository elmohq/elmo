import { createHash } from "node:crypto";
import type { Brand, Competitor } from "./db/schema";

export const MENTIONS_VERSION = 1;

/** Malformed input falls back to the raw value: a stored typo shouldn't fail a run. */
export function normalizeDomain(urlOrDomain: string): string {
	try {
		const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return urlOrDomain.replace(/^www\./, "").toLowerCase();
	}
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

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export type NonMentionReason = "other_meaning" | "other_company" | "no_info";

export interface MentionAssessment {
	mentioned: boolean;
	probability: number;
	reason?: NonMentionReason;
	sentiment?: Sentiment;
	sentimentProbabilities?: Record<string, number>;
	/**
	 * Offsets into the run's stored text of the passage the assessment rests on: the one that most
	 * carries its sentiment when it has one, otherwise the one that most decided the mention.
	 */
	passage?: { start: number; end: number };
	/** For a mention: offset into the run's stored text of the first one. */
	firstMention?: number;
	mentionCount?: number;
	/**
	 * For a mention: 1 for the tracked company the answer names first, 2 for the next, and so on.
	 * Only tracked companies are ranked; others the answer names are not known.
	 */
	position?: number;
}

export interface RunMentionAssessments {
	/** Absent when the answer never names the brand. */
	brand?: MentionAssessment;
	/** Keyed by competitor name, as in `competitors_mentioned`; only competitors the answer names. */
	competitors: Record<string, MentionAssessment>;
	/**
	 * The `subjectFingerprint` each subject was judged under, including subjects the answer never
	 * names. A replay re-judges only the subjects whose fingerprint has changed.
	 */
	judged: { brand: string; competitors: Record<string, string> };
}

type Subject = MentionConfig["brand"];

/**
 * A subject as the judge reads it. Case is kept: the model sees the names as written, so recasing
 * one is a different input.
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
 * What a subject's assessments depend on: the subject as judged, and the judge. Rival names are left
 * out on purpose, so adding a competitor re-judges only that competitor rather than every subject
 * whose list of rivals it joined; those rivals are context for the model, not what it decides.
 */
export function subjectFingerprint(subject: Subject, judgeVersion: string): string {
	return digest({ ...judgedSubject(subject), judgeVersion });
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

/**
 * A letter or digit that continues a word. Not one from a script written without spaces between
 * words (Chinese, Japanese, Thai…) or from Korean, whose particles attach to the word before them:
 * "Elmo是…" and "Elmo는…" both name Elmo.
 */
const WORD_CHAR = String.raw`[[\p{L}\p{N}]--[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]]`;

/** A term inside a longer word ("ace" in "place") is never the subject, so only whole words match. */
export function wholeWordPattern(term: string): RegExp {
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<!${WORD_CHAR})${escaped}(?!${WORD_CHAR})`, "giv");
}

/**
 * Identifies the judge and brand config a run's mentions were derived from. It's made of each
 * subject's fingerprint, so it changes exactly when some subject must be re-judged.
 */
export function mentionsStamp(config: MentionConfig, judgeVersion: string): string {
	const subjects = digest({
		brand: subjectFingerprint(config.brand, judgeVersion),
		competitors: config.competitors.map((c) => [c.name, subjectFingerprint(c, judgeVersion)]).sort(),
	});
	return `${MENTIONS_VERSION}:${subjects}:judge-${judgeVersion}`;
}
