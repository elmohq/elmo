import type { JudgedEntity, MentionJudge } from "./judge";
import { type MatchWindow, matchWindows } from "./windows";

/**
 * Reference labels that count as a mention. A brand cited only through a link counts; the model
 * keeps `link_only` separate so that stays a policy choice.
 */
const MENTION_REFERENCES = ["brand", "link_only"];

/** Below this calibrated probability either way, the verdict is "uncertain"; it still counts as a mention. */
const CONFIDENT = 0.7;

export type MentionVerdict = "mentioned" | "not_mentioned" | "uncertain";
export type SentimentVerdict = "positive" | "neutral" | "negative" | "mixed" | "uncertain";

export interface Evidence {
	start: number;
	end: number;
}

export interface MentionAssessment {
	mention: MentionVerdict;
	/** Calibrated probability that the answer mentions the entity, from its most convincing passage. */
	mentionProbability: number;
	/** For a verdict short of a confident mention: the likeliest non-mention reading. */
	reason?: string;
	sentiment?: SentimentVerdict;
	sentimentProbabilities?: Record<string, number>;
	evidence?: Evidence;
	/** For a verdict that counts: the offset in the answer of its first mention of the entity. */
	firstMention?: number;
	/** For a verdict that counts: how many times the answer mentions the entity, among the passages judged. */
	mentionCount?: number;
}

const span = ({ start, end }: MatchWindow): Evidence => ({ start, end });

function top(probs: Record<string, number>): [string, number] {
	return Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
}

/**
 * Judges every match of the entity in an answer and combines them: the answer mentions the entity
 * if any passage does or it links to the entity's own site, unless the answer says it has no
 * information about the entity. Sentiment is the probability-weighted average over the passages
 * about the entity.
 */
export async function assessMention(
	judge: MentionJudge,
	entity: JudgedEntity,
	answer: string,
): Promise<MentionAssessment | null> {
	const terms = [entity.name, ...(entity.aliases ?? []), ...(entity.domains ?? [])];
	const { windows, linkHits } = matchWindows(answer, terms);
	const linksToEntity = linkHits.length > 0;
	if (windows.length === 0) {
		if (!linksToEntity) return null;
		return { mention: "mentioned", mentionProbability: 1, firstMention: linkHits[0], mentionCount: linkHits.length };
	}

	const judged: JudgedWindow[] = [];
	for (const window of windows) {
		const j = await judge.judge(entity, window.text);
		const pMention = MENTION_REFERENCES.reduce((sum, label) => sum + (j.reference[label] ?? 0), 0);
		judged.push({ window, pMention, reference: j.reference, sentiment: j.sentiment });
	}

	// "I don't have information about X" describes the whole answer, even when it ends by pointing to X's site.
	const disclaimer = judged.find((j) => (j.reference.no_info ?? 0) >= CONFIDENT);
	if (disclaimer) {
		return {
			mention: "not_mentioned",
			mentionProbability: 1 - (disclaimer.reference.no_info ?? 0),
			reason: "no_info",
			evidence: span(disclaimer.window),
		};
	}

	const assessment = mentionFromPassages(judged, linksToEntity);
	const sentiment = combineSentiment(judged.filter((j) => j.pMention >= 0.5));
	if (sentiment) Object.assign(assessment, sentiment);
	if (assessment.mention !== "not_mentioned") Object.assign(assessment, placement(judged, linkHits));
	return assessment;
}

/**
 * Where and how often the answer mentions the entity, counting only matches in passages that
 * aren't confidently about something else, plus links: the inputs to its position among the
 * companies the answer names.
 */
function placement(
	judged: JudgedWindow[],
	linkHits: number[],
): Pick<MentionAssessment, "firstMention" | "mentionCount"> {
	const hits = [...judged.filter((j) => j.pMention > 1 - CONFIDENT).flatMap((j) => j.window.hits), ...linkHits];
	if (hits.length === 0) return {};
	return { firstMention: Math.min(...hits), mentionCount: new Set(hits).size };
}

interface JudgedWindow {
	window: MatchWindow;
	pMention: number;
	reference: Record<string, number>;
	sentiment: Record<string, number>;
}

function combineSentiment(
	about: JudgedWindow[],
): Pick<MentionAssessment, "sentiment" | "sentimentProbabilities" | "evidence"> | null {
	if (about.length === 0) return null;
	const weight = about.reduce((sum, j) => sum + j.pMention, 0);
	const probabilities: Record<string, number> = {};
	for (const j of about) {
		for (const [label, p] of Object.entries(j.sentiment)) {
			probabilities[label] = (probabilities[label] ?? 0) + (p * j.pMention) / weight;
		}
	}
	const [label, p] = top(probabilities);
	const strongest = about.reduce((a, b) => ((b.sentiment[label] ?? 0) > (a.sentiment[label] ?? 0) ? b : a));
	return {
		sentiment: p >= CONFIDENT ? (label as SentimentVerdict) : "uncertain",
		sentimentProbabilities: probabilities,
		evidence: span(strongest.window),
	};
}

function mentionFromPassages(judged: JudgedWindow[], linksToEntity: boolean): MentionAssessment {
	const best = judged.reduce((a, b) => (b.pMention > a.pMention ? b : a));
	const pMention = linksToEntity ? 1 : best.pMention;
	const mention: MentionVerdict =
		pMention >= CONFIDENT ? "mentioned" : pMention <= 1 - CONFIDENT ? "not_mentioned" : "uncertain";
	const assessment: MentionAssessment = {
		mention,
		mentionProbability: pMention,
		evidence: span(best.window),
	};
	if (mention !== "mentioned") {
		const nonMention = Object.fromEntries(
			Object.entries(best.reference).filter(([label]) => !MENTION_REFERENCES.includes(label)),
		);
		assessment.reason = top(nonMention)[0];
	}
	return assessment;
}
