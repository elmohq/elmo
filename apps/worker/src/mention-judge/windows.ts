/**
 * Splits an answer into the passages the judge reads: for every match of a tracked name, alias or
 * domain, the sentence containing it plus one sentence either side. Judging each match separately
 * keeps long answers within the model's input limit and lets later mentions count.
 */
import { wholeWordPattern } from "@workspace/lib/mentions";

export interface MatchWindow {
	/** Character offsets of the window in the answer, for pointing the UI at the evidence. */
	start: number;
	end: number;
	text: string;
	/** Offsets in the answer of the matches this window was cut around. */
	hits: number[];
}

export interface AnswerMatches {
	windows: MatchWindow[];
	/** Offsets of whole-word matches inside links, which count as the brand being cited. */
	linkHits: number[];
	/** Offsets of matches past the passages judged, which still count toward how often it's named. */
	unjudgedHits: number[];
}

const MAX_WINDOWS = 8;
const MAX_WINDOW_CHARS = 1800;
/** Well inside what the model reads of a passage once the entity's own description is counted. */
const MAX_LEAD_CHARS = 400;

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

/**
 * The sentence before the hit, its own, and the one after. The model reads only so much of a
 * passage and drops the tail, so a long lead-in is shortened until the hit sits near the start.
 */
function windowAround(sentences: [number, number][], k: number, hit: number): { start: number; end: number } {
	let start = sentences[Math.max(0, k - 1)][0];
	if (hit - start > MAX_LEAD_CHARS) start = sentences[k][0];
	if (hit - start > MAX_LEAD_CHARS) start = hit - MAX_LEAD_CHARS;
	const end = Math.min(sentences[Math.min(sentences.length - 1, k + 1)][1], start + MAX_WINDOW_CHARS);
	return { start, end };
}

/** Start offsets of whole-word matches of any term, in order. */
function findHits(text: string, terms: string[]): number[] {
	const needles = new Map(
		terms
			.map((t) => t.trim())
			.filter(Boolean)
			.map((t) => [t.toLowerCase(), t]),
	);
	const hits: number[] = [];
	// Searched case-insensitively in the original text: lowercasing first can change its length
	// ("İ" becomes two code units) and shift every offset after it.
	for (const needle of needles.values()) {
		for (const match of text.matchAll(wholeWordPattern(needle))) hits.push(match.index ?? 0);
	}
	return hits.sort((a, b) => a - b);
}

export function matchWindows(text: string, terms: string[]): AnswerMatches {
	const sentences = sentenceSpans(text);
	const links = linkSpans(text);
	const windows = new Map<string, MatchWindow>();
	const linkHits: number[] = [];
	const unjudgedHits: number[] = [];
	for (const hit of findHits(text, terms)) {
		if (links.some(([a, z]) => hit >= a && hit < z)) {
			linkHits.push(hit);
			continue;
		}
		const k = sentences.findIndex(([a, z]) => hit >= a && hit < z);
		if (k === -1) continue;
		const { start, end } = windowAround(sentences, k, hit);
		const key = `${start}:${end}`;
		const existing = windows.get(key);
		if (existing) existing.hits.push(hit);
		else if (windows.size < MAX_WINDOWS)
			windows.set(key, { start, end, text: text.slice(start, end).trim(), hits: [hit] });
		else unjudgedHits.push(hit);
	}
	return { windows: [...windows.values()], linkHits, unjudgedHits };
}
