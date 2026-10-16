/**
 * Which tracked companies a cleaned answer names, and for each, the few passages the judge may quote
 * as the evidence for how the answer portrays it.
 */
import { judgedSubject, type MentionConfig, wholeWordPattern } from "@workspace/lib/mentions";

type Subject = MentionConfig["brand"];

export type SentenceKind = "heading" | "table" | "text";

export interface Sentence {
	text: string;
	kind: SentenceKind;
}

const ATX_HEADING = /^#{1,6}\s/;
const UNDERLINE = /^\s*(=+|-+)\s*$/;
const TABLE_ROW = /^\s*\||\|.*\|/;

/** Sentences of the cleaned answer, line by line; a table row stays whole. */
export function sentences(text: string): Sentence[] {
	const lines = text.split("\n");
	const out: Sentence[] = [];
	lines.forEach((line, i) => {
		if (!/[\p{L}\p{N}]/u.test(line)) return;
		if (TABLE_ROW.test(line)) {
			out.push({ text: line.trim(), kind: "table" });
			return;
		}
		const heading = ATX_HEADING.test(line) || UNDERLINE.test(lines[i + 1] ?? "");
		const parts: string[] = [];
		for (const part of line.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}*#[(|])/u)) {
			// A list number ("1.") belongs to what follows it.
			const previous = parts.at(-1);
			if (previous !== undefined && !/\p{L}/u.test(previous)) parts[parts.length - 1] = `${previous} ${part}`;
			else parts.push(part);
		}
		parts
			.filter((part) => /[\p{L}\p{N}]/u.test(part))
			.forEach((part, j) => {
				out.push({ text: part.trim(), kind: heading && j === 0 ? "heading" : "text" });
			});
	});
	return out;
}

/** Whether text names the subject: a name, alias or domain, as a whole word, as `mentionOffsets` counts them. */
export function matcher(subject: Subject): (text: string) => boolean {
	const { name, aliases, domains } = judgedSubject(subject);
	const terms = [name, ...aliases, ...domains].filter(Boolean).map((term) => wholeWordPattern(term));
	return (text) =>
		terms.some((pattern) => {
			pattern.lastIndex = 0;
			return pattern.test(text);
		});
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
): string[] {
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
		.map((run) => run.map((i) => all[i].text).join(" "))
		.filter((passage) => /\p{L}{2}/u.test(passage.replace(/\((?:[a-z0-9-]+\.)+[a-z]{2,}\)/g, "")));
}

/** Offsets of every mention of the subject in the original answer, for its position and count. */
export function mentionOffsets(answer: string, subject: Subject): number[] {
	const { name, aliases, domains } = judgedSubject(subject);
	const offsets = new Set<number>();
	for (const term of [name, ...aliases, ...domains].filter(Boolean)) {
		for (const match of answer.matchAll(wholeWordPattern(term))) offsets.add(match.index ?? 0);
	}
	return [...offsets].sort((a, b) => a - b);
}
