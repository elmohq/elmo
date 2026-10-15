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

interface PositionedNode extends HastNode {
	position?: { start: { offset?: number }; end: { offset?: number } };
}

export interface MarkRange {
	/** Offsets into the markdown source, as the mention judge's assessments record them. */
	start: number;
	end: number;
	className: string;
}

/**
 * Rehype plugin marking the rendered text that came from `range` of the markdown source. Text
 * nodes carry their source offsets; one whose text differs in length from its source (an escape
 * or entity) is marked whole rather than sliced at a guess.
 */
export function rehypeMarkRange(range: MarkRange) {
	const visit = (node: PositionedNode) => {
		if (!node.children) return;
		node.children = node.children.flatMap((child: PositionedNode): HastNode[] => {
			if (child.type === "text" && child.value) return markTextNode(child, range);
			visit(child);
			return [child];
		});
	};
	return () => visit;
}

function markTextNode(node: PositionedNode, range: MarkRange): HastNode[] {
	const value = node.value ?? "";
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	if (start === undefined || end === undefined || end <= range.start || start >= range.end) return [node];
	const mark = (text: string): HastNode =>
		({
			type: "element",
			tagName: "mark",
			properties: { className: [range.className], dataPassage: true },
			children: [{ type: "text", value: text }],
		}) as HastNode;
	if (value.length !== end - start) return [mark(value)];
	const from = Math.max(range.start, start) - start;
	const to = Math.min(range.end, end) - start;
	return [
		...(from > 0 ? [{ type: "text", value: value.slice(0, from) }] : []),
		mark(value.slice(from, to)),
		...(to < value.length ? [{ type: "text", value: value.slice(to) }] : []),
	];
}
