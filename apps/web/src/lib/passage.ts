import type { MentionAssessment } from "@workspace/lib/mentions";

/** The passage an assessment rests on in the run's stored text, or null when there is none or it runs past the text's end. */
export function assessedPassage(text: string | null, assessment: MentionAssessment): string | null {
	const passage = assessment.passage;
	if (text === null || !passage || passage.end > text.length) return null;
	return text.slice(passage.start, passage.end).trim() || null;
}
