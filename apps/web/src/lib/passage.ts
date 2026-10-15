import type { MentionAssessment } from "@workspace/lib/mentions";

export function passageRange(
	text: string | null,
	assessment: MentionAssessment,
): { start: number; end: number } | null {
	const passage = assessment.passage;
	if (text === null || !passage || passage.end > text.length || passage.start >= passage.end) return null;
	return { start: passage.start, end: passage.end };
}

export function assessedPassage(text: string | null, assessment: MentionAssessment): string | null {
	const range = passageRange(text, assessment);
	return (range && text?.slice(range.start, range.end).trim()) || null;
}
