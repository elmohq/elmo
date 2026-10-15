import type { MentionAssessmentRecord } from "@workspace/lib/mentions";

/**
 * The passage a verdict rests on, or null when there is none or `text` is not the text it was
 * judged on: offsets only index the run's stored text, and an offset past its end means the text
 * has changed since.
 */
export function evidencePassage(text: string | null, record: MentionAssessmentRecord): string | null {
	const evidence = record.evidence;
	if (text === null || !evidence || evidence.end > text.length) return null;
	return text.slice(evidence.start, evidence.end).trim() || null;
}
