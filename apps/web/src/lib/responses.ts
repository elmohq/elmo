export const RESPONSES_PAGE_SIZE = 20;

/** Wraps each highlighted term in a search snippet; control characters can't collide with answer text. */
export const SNIPPET_MARK_START = "\u0002";
export const SNIPPET_MARK_END = "\u0003";

export interface SnippetSegment {
	text: string;
	highlighted: boolean;
}

/**
 * Answers are stored as markdown and snippets are cut from the middle of it,
 * so they arrive with half-open links and stray emphasis. A snippet is read as
 * one line of prose, so the syntax is dropped rather than rendered.
 */
function stripMarkdown(text: string): string {
	return (
		text
			// Links and images keep their label; the URL is noise in a preview.
			.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
			// A link the snippet cut through leaves its tail behind.
			.replace(/\]\([^)\s]*\)?/g, " ")
			.replace(/^\s*#{1,6}\s+/gm, "")
			.replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
			.replace(/^\s*>\s?/gm, "")
			.replace(/^\s*\|?\s*:?-{3,}.*$/gm, "")
			.replace(/\*\*|__|`|[[\]|*]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
	);
}

export function snippetSegments(snippet: string): SnippetSegment[] {
	const segments: SnippetSegment[] = [];
	const pattern = new RegExp(`${SNIPPET_MARK_START}([^${SNIPPET_MARK_END}]*)${SNIPPET_MARK_END}`, "g");
	const cleaned = stripMarkdown(snippet);
	let last = 0;
	for (const match of cleaned.matchAll(pattern)) {
		if (match.index > last) segments.push({ text: cleaned.slice(last, match.index), highlighted: false });
		segments.push({ text: match[1], highlighted: true });
		last = match.index + match[0].length;
	}
	if (last < cleaned.length) segments.push({ text: cleaned.slice(last), highlighted: false });
	return segments;
}
