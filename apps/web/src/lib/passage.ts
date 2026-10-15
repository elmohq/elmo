import type { MentionAssessment } from "@workspace/lib/mentions";

export function assessedPassage(text: string | null, assessment: MentionAssessment): string | null {
	const passage = assessment.passage;
	if (text === null || !passage || passage.end > text.length) return null;
	return text.slice(passage.start, passage.end).trim() || null;
}
