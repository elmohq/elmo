import type { MentionAssessmentRecord } from "@workspace/lib/mentions";

/**
 * Where in `text` the passage a verdict rests on lies, or null when there is none or `text` is not
 * the text it was judged on: offsets only index the run's stored text, and an offset past its end
 * means the text has changed since.
 */
export function evidenceRange(
	text: string | null,
	record: MentionAssessmentRecord,
): { start: number; end: number } | null {
	const evidence = record.evidence;
	if (text === null || !evidence || evidence.end > text.length || evidence.start >= evidence.end) return null;
	return { start: evidence.start, end: evidence.end };
}

export function evidencePassage(text: string | null, record: MentionAssessmentRecord): string | null {
	const range = evidenceRange(text, record);
	return (range && text?.slice(range.start, range.end).trim()) || null;
}
