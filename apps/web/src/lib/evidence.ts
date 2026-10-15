import type { MentionAssessmentRecord } from "@workspace/lib/mentions";

/** The passage a verdict rests on in the run's stored text, or null when there is none or it runs past the text's end. */
export function evidencePassage(text: string | null, record: MentionAssessmentRecord): string | null {
	const evidence = record.evidence;
	if (text === null || !evidence || evidence.end > text.length) return null;
	return text.slice(evidence.start, evidence.end).trim() || null;
}
