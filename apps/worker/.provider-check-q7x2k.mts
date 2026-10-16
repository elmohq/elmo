import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { tryExtractTextContent } from "@workspace/lib/text-extraction";
import { cleanAnswer, locatePassage } from "./src/mention-judge/clean.ts";
import { matcher, mentionOffsets, quoteOptions, sentences } from "./src/mention-judge/passages.ts";

const MAX = 50_000;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const words = (s: string) =>
	(s.replace(/\(image: /g, " ").replace(/\((?:[a-z0-9-]+\.)+[a-z]{2,}\)/g, "").match(WORD) ?? []).map((w) => w.toLowerCase());

const MARKUP: Record<string, RegExp> = {
	"](": /\]\(/,
	http: /https?:\/\//,
	base64: /base64/,
	htmlTag: /<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/i,
	htmlEntity: /&(amp|nbsp|ndash|mdash|quot|lt|gt|#\d+);/,
	numMarker: /\[\d+\]/,
	footnote: /\[\^/,
	cjkCite: /【/,
	pua: /[-]/,
	"\\[": /\\\[/,
	backslashEsc: /\\[\\"*_#.\-!()`~>|]/,
	refDef: /^\s*\[[^\]]+\]:\s/m,
	codeFence: /```/,
	utm: /utm_source/,
};

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
const results: any[] = [];
for (const s of input) {
	let text: string | null = s.text;
	if (s.raw && s.extractor) text = tryExtractTextContent(s.raw, s.extractor);
	if (!text) {
		results.push({ group: s.group, id: s.id, empty: true });
		continue;
	}
	const t0 = performance.now();
	const cleanedFull = cleanAnswer(text);
	const t1 = performance.now();
	const readable = cleanedFull.slice(0, MAX);
	const split = sentences(readable);
	const t2 = performance.now();
	const subjects = [s.config.brand, ...s.config.competitors].map((subject: any) => ({ subject, names: matcher(subject) }));
	const named = subjects.filter((e) => e.names(readable));
	const markup = Object.fromEntries(
		Object.entries(MARKUP).flatMap(([k, re]) => {
			const m = re.exec(readable);
			return m ? [[k, readable.slice(Math.max(0, m.index - 60), m.index + 60)]] : [];
		}),
	);
	const opts: any[] = [];
	let locateMs = 0;
	let maxLocate = 0;
	for (const entry of named) {
		const others = named.filter((o) => o !== entry);
		const options = quoteOptions(split, entry.names, (t) => others.some((o) => o.names(t)));
		for (const option of options) {
			const a = performance.now();
			const loc = locatePassage(text, option);
			const ms = performance.now() - a;
			locateMs += ms;
			maxLocate = Math.max(maxLocate, ms);
			const ow = words(option);
			const rec: any = { subject: entry.subject.name, option, ms, optionWords: ow.length };
			if (loc) {
				const span = text.slice(loc.start, loc.end);
				const sw = words(cleanAnswer(span));
				rec.span = span;
				rec.spanWords = sw.length;
				rec.located = true;
				rec.tooWide = sw.length > 1.25 * ow.length;
				rec.exact = sw.join(" ") === ow.join(" ");
				rec.namesInSpan = entry.names(cleanAnswer(span));
				rec.namesInOption = entry.names(option);
			} else rec.located = false;
			opts.push(rec);
		}
	}
	const t3 = performance.now();
	const positions: any[] = [];
	for (const e of subjects) {
		const offsets = mentionOffsets(text, e.subject);
		const inReadable = e.names(readable);
		const inFull = e.names(cleanedFull);
		let firstInMarkup = false;
		if (offsets.length) {
			const o = offsets[0];
			// first offset inside a link target / bare URL / image?
			const re = /\]\([^)\s]*\)|https?:\/\/[^\s)\]]+|data:[^\s)]+/g;
			for (const m of text.matchAll(re)) if (o >= m.index! && o < m.index! + m[0].length) firstInMarkup = true;
		}
		if ((inReadable && !offsets.length) || (!inReadable && offsets.length) || firstInMarkup)
			positions.push({
				subject: e.subject.name,
				terms: [e.subject.name, ...e.subject.aliases, ...e.subject.domains],
				inReadable,
				inFull,
				offsets: offsets.length,
				firstInMarkup,
				ctx: offsets.length ? text.slice(Math.max(0, offsets[0] - 80), offsets[0] + 80) : undefined,
			});
	}
	const t4 = performance.now();
	const lines = readable.split("\n");
	results.push({
		group: s.group,
		id: s.id,
		db: s.db,
		note: s.note,
		origLen: text.length,
		cleanLen: cleanedFull.length,
		truncated: cleanedFull.length > MAX,
		markup,
		named: named.map((e) => e.subject.name),
		subjectsCount: subjects.length,
		sentences: split.length,
		longSentences: split.filter((x) => x.text.length > 600).map((x) => x.text.slice(0, 200)),
		lowerStart: split.filter((x) => x.kind === "text" && /^[\p{Ll}]/u.test(x.text)).map((x) => x.text.slice(0, 120)),
		punctOnlyStart: split.filter((x) => /^[,.;:)\]]/.test(x.text)).map((x) => x.text.slice(0, 120)),
		markerSentences: split.filter((x) => /^\W*(\[\d+\]\W*)+$/.test(x.text)).length,
		cjkUnsplit: split.filter((x) => (x.text.match(/[。！？]/g) ?? []).length >= 2).map((x) => x.text.slice(0, 120)),
		tableRows: split.filter((x) => x.kind === "table").length,
		pipeInText: lines.filter((l) => l.includes("|") && !/^\s*\|/.test(l)).length,
		opts,
		positions,
		ms: { clean: t1 - t0, split: t2 - t1, locate: locateMs, maxLocate, offsets: t4 - t3, total: t4 - t0 },
		cleaned: readable,
		original: text,
	});
}
writeFileSync(process.argv[3], JSON.stringify(results));
console.log("done", results.length);
