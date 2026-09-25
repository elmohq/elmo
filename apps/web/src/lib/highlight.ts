export const HIGHLIGHT_CLASS = "rounded-sm bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/40";

export interface HighlightPart {
	text: string;
	match: boolean;
}

/** Splits `text` around every case-insensitive occurrence of `term`, matching how search compares. */
export function splitHighlights(text: string, term: string): HighlightPart[] {
	if (!term) return [{ text, match: false }];
	const parts: HighlightPart[] = [];
	const haystack = text.toLowerCase();
	const needle = term.toLowerCase();
	let start = 0;
	for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, start)) {
		if (at > start) parts.push({ text: text.slice(start, at), match: false });
		parts.push({ text: text.slice(at, at + needle.length), match: true });
		start = at + needle.length;
	}
	if (start < text.length) parts.push({ text: text.slice(start), match: false });
	return parts;
}

interface HastNode {
	type: string;
	value?: string;
	children?: HastNode[];
}

/**
 * Rehype plugin wrapping matches in `<mark>`. It works per text node, so a
 * term that spans formatting (half bold, half plain) isn't marked.
 */
export function rehypeHighlight(term: string) {
	const visit = (node: HastNode) => {
		if (!node.children) return;
		node.children = node.children.flatMap((child): HastNode[] => {
			if (child.type !== "text" || !child.value) {
				visit(child);
				return [child];
			}
			return splitHighlights(child.value, term).map((part) =>
				part.match
					? ({
							type: "element",
							tagName: "mark",
							properties: {},
							children: [{ type: "text", value: part.text }],
						} as HastNode)
					: { type: "text", value: part.text },
			);
		});
	};
	return () => visit;
}
