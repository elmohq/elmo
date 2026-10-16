import { judgeAnalyzer } from "../analyze";
import type { Judgment, MentionJudge } from "../judge";

/**
 * Stands in for the model: reads a cue word in the passage and answers with confident
 * probabilities, and reads any other passage naming the subject as a neutral mention.
 */
function cuedJudgment(passage: string): Judgment {
	const reference = { brand: 0.02, other_meaning: 0.02, other_company: 0.02, link_only: 0.02, no_info: 0.02 };
	if (/no information/i.test(passage)) reference.no_info = 0.92;
	else if (/fruit/i.test(passage)) reference.other_meaning = 0.92;
	else if (/perhaps/i.test(passage)) Object.assign(reference, { brand: 0.5, other_company: 0.44 });
	else reference.brand = 0.92;
	const sentiment = { positive: 0.05, neutral: 0.05, negative: 0.05, mixed: 0.05 };
	if (/terrible/i.test(passage)) sentiment.negative = 0.85;
	else if (/great/i.test(passage)) sentiment.positive = 0.85;
	else if (/somewhat/i.test(passage)) Object.assign(sentiment, { positive: 0.55, neutral: 0.35 });
	else sentiment.neutral = 0.85;
	return { reference, sentiment };
}

export const cuedJudge: MentionJudge = { version: "test", judge: async (_entity, passage) => cuedJudgment(passage) };

export const cuedAnalyzer = judgeAnalyzer(cuedJudge);
