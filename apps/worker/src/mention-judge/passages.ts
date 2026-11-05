/**
 * Which tracked companies a cleaned answer names, and for each, the few passages the judge may quote
 * as the evidence for how the answer portrays it.
 */
import { judgedSubject, type MentionConfig, wholeWordPattern } from "@workspace/lib/mentions";
import { INLINE_DATA } from "./clean";

type Subject = MentionConfig["brand"];

export type SentenceKind = "heading" | "table" | "text";

export interface Sentence {
	text: string;
	kind: SentenceKind;
	start: number;
	end: number;
}

const ATX_HEADING = /^#{1,6}\s/;
const UNDERLINE = /^\s*(=+|-+)\s*$/;
const TABLE_ROW = /^\s*\||\|.*\|/;
const CHIP = String.raw`\((?:[a-z0-9-]+\.)+[a-z]{2,}\)`;
/**
 * Between sentences: after end punctuation and any citations trailing it ("[1]", "(site.com)"),
 * before what starts a sentence, but not before a citation; or right after CJK end punctuation.
 */
const BOUNDARY = new RegExp(
	String.raw`(?<=[.!?](?:\[\d+\]|\s?${CHIP})*)\s+(?!${CHIP})(?=[\p{Lu}\p{N}*#[(|])|(?<=[。！？])(?=\S)`,
	"gu",
);

/** Sentences of the cleaned answer, line by line; a table row stays whole. */
export function sentences(text: string): Sentence[] {
	const out: Sentence[] = [];
	const lines = text.split("\n");
	let lineStart = 0;
	lines.forEach((line, i) => {
		const offset = lineStart;
		lineStart += line.length + 1;
		if (!/[\p{L}\p{N}]/u.test(line)) return;
		if (TABLE_ROW.test(line)) {
			out.push(trimmed(text, offset, offset + line.length, "table"));
			return;
		}
		const heading = ATX_HEADING.test(line) || UNDERLINE.test(lines[i + 1] ?? "");
		const parts: [number, number][] = [];
		let partStart = 0;
		for (const boundary of [...line.matchAll(BOUNDARY), { index: line.length, 0: "" }]) {
			const part: [number, number] = [partStart, boundary.index ?? line.length];
			partStart = part[1] + boundary[0].length;
			// A list number ("1.") belongs to what follows it.
			const previous = parts.at(-1);
			if (previous && !/\p{L}/u.test(line.slice(...previous))) previous[1] = part[1];
			else parts.push(part);
		}
		parts
			.filter(([start, end]) => /[\p{L}\p{N}]/u.test(line.slice(start, end)))
			.forEach(([start, end], j) => {
				out.push(trimmed(text, offset + start, offset + end, heading && j === 0 ? "heading" : "text"));
			});
	});
	return out;
}

function trimmed(text: string, start: number, end: number, kind: SentenceKind): Sentence {
	while (start < end && /\s/.test(text[start])) start++;
	while (end > start && /\s/.test(text[end - 1])) end--;
	return { text: text.slice(start, end), kind, start, end };
}

/** Whether text names the subject: a name, alias or domain, as a whole word, as `mentionOffsets` counts them. */
export function matcher(subject: Subject): (text: string) => boolean {
	const patterns = termPatterns(subject);
	return (text) =>
		patterns.some((pattern) => {
			pattern.lastIndex = 0;
			return pattern.test(text);
		});
}

function termPatterns(subject: Subject): RegExp[] {
	const { name, aliases, domains } = judgedSubject(subject);
	return [name, ...aliases, ...domains].filter(Boolean).map((term) => wholeWordPattern(term));
}

/** Sentences after a mention that may still be about it: a heading's description, a tagline's detail. */
const FOLLOWING = 3;
const MAX_SENTENCES = 12;
const MAX_PER_PASSAGE = 3;

/**
 * The passages the judge chooses its evidence from: each sentence naming the subject with up to
 * three after it, stopping at another tracked company, a heading or a table. Consecutive sentences
 * are offered together, up to three, so a tagline travels with the sentence that explains it.
 */
export function quoteOptions(
	all: Sentence[],
	names: (text: string) => boolean,
	namesOther: (text: string) => boolean,
): Sentence[] {
	const picked: number[] = [];
	all.forEach((sentence, i) => {
		if (!names(sentence.text)) return;
		for (let j = i; j < Math.min(all.length, i + FOLLOWING + 1); j++) {
			const next = all[j];
			if (j > i && (names(next.text) || namesOther(next.text) || next.kind !== "text")) break;
			if (!picked.includes(j)) picked.push(j);
		}
	});
	const kept = picked.sort((a, b) => a - b).slice(0, MAX_SENTENCES);
	const passages: number[][] = [];
	for (const i of kept) {
		const last = passages.at(-1);
		if (last && i === last[last.length - 1] + 1 && last.length < MAX_PER_PASSAGE && all[i].kind === "text")
			last.push(i);
		else passages.push([i]);
	}
	// A citation chip on its own line, "(techradar.com)", says nothing about the company.
	return passages
		.map((run) => ({
			text: run.map((i) => all[i].text).join(" "),
			kind: all[run[0]].kind,
			start: all[run[0]].start,
			end: all[run[run.length - 1]].end,
		}))
		.filter((passage) => /\p{L}{2}/u.test(passage.text.replace(new RegExp(CHIP, "g"), "")));
}

/**
 * Offsets of every mention of the subject in the original answer, for its position and count. A
 * link's target (a URL slug like ".../nike-vs-hoka") isn't the answer naming anyone, so it counts
 * only for a company the answer cites and never names.
 */
export function mentionOffsets(answer: string, subject: Subject): number[] {
	const visible = answer
		.replace(INLINE_DATA, (data) => " ".repeat(data.length))
		.replace(/\]\([^)\s]{0,2000}\)|https?:\/\/[^\s)\]]+/g, (target) => " ".repeat(target.length));
	const named = offsetsIn(visible, subject);
	return named.length ? named : offsetsIn(answer, subject);
}

function offsetsIn(text: string, subject: Subject): number[] {
	const offsets = new Set<number>();
	for (const pattern of termPatterns(subject)) {
		for (const match of text.matchAll(pattern)) offsets.add(match.index ?? 0);
	}
	return [...offsets].sort((a, b) => a - b);
}
