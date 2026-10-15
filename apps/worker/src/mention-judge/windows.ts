/**
 * Splits an answer into the passages the judge reads: for every match of a tracked name, alias or
 * domain, the sentence containing it plus one sentence either side. Judging each match separately
 * keeps long answers within the model's input limit and lets later mentions count.
 */

export interface MatchWindow {
	/** Character offsets of the window in the answer, for pointing the UI at the evidence. */
	start: number;
	end: number;
	text: string;
}

export interface AnswerMatches {
	/** Passages around matches in the answer's own text, for the model to judge. */
	windows: MatchWindow[];
	/** Whole-word matches inside links, which count as the brand being cited. */
	linkMatches: number;
}

const MAX_WINDOWS = 8;
const MAX_WINDOW_CHARS = 1800;

/** Sentence spans; a "." followed by a non-space (domains, URLs, decimals) does not end a sentence. */
function sentenceSpans(text: string): [number, number][] {
	const spans: [number, number][] = [];
	for (const line of text.matchAll(/[^\n]+/g)) {
		const base = line.index ?? 0;
		let start = 0;
		for (const end of line[0].matchAll(/[.!?]+(?=\s|$)/g)) {
			const stop = (end.index ?? 0) + end[0].length;
			if (line[0].slice(start, stop).trim()) spans.push([base + start, base + stop]);
			start = stop;
		}
		if (line[0].slice(start).trim()) spans.push([base + start, base + line[0].length]);
	}
	return spans;
}

function linkSpans(text: string): [number, number][] {
	return [...text.matchAll(/\]\(([^)\s]+)\)|https?:\/\/[^\s)\]]+/g)].map((m) => [
		m.index ?? 0,
		(m.index ?? 0) + m[0].length,
	]);
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A match inside a longer word ("ace" in "place") is never the brand, so it isn't judged at all. */
function isWholeWord(text: string, start: number, end: number): boolean {
	return !WORD_CHAR.test(text[start - 1] ?? "") && !WORD_CHAR.test(text[end] ?? "");
}

export function matchWindows(text: string, terms: string[]): AnswerMatches {
	const needles = new Map(
		terms
			.map((t) => t.trim())
			.filter(Boolean)
			.map((t) => [t.toLowerCase(), t]),
	);
	const sentences = sentenceSpans(text);
	const links = linkSpans(text);
	const windows = new Map<string, MatchWindow>();
	let linkMatches = 0;
	const hits: [number, number][] = [];
	// Searched case-insensitively in the original text: lowercasing first can change its length
	// ("İ" becomes two code units) and shift every offset after it.
	for (const needle of needles.values()) {
		for (const match of text.matchAll(new RegExp(escapeRegExp(needle), "giu"))) {
			const start = match.index ?? 0;
			const end = start + match[0].length;
			if (isWholeWord(text, start, end)) hits.push([start, end]);
		}
	}
	for (const [hit] of hits.sort((a, b) => a[0] - b[0])) {
		if (links.some(([a, z]) => hit >= a && hit < z)) {
			linkMatches++;
			continue;
		}
		const k = sentences.findIndex(([a, z]) => hit >= a && hit < z);
		if (k === -1 || windows.size === MAX_WINDOWS) continue;
		const start = sentences[Math.max(0, k - 1)][0];
		const end = sentences[Math.min(sentences.length - 1, k + 1)][1];
		const key = `${start}:${end}`;
		if (!windows.has(key))
			windows.set(key, { start, end, text: text.slice(start, end).trim().slice(0, MAX_WINDOW_CHARS) });
	}
	return { windows: [...windows.values()], linkMatches };
}
