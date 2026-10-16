/**
 * Turns a stored answer (markdown full of images, link targets, citation markers and inline data)
 * into the text the judge reads, remembering where each character came from, so a passage the
 * judge picks maps straight back to the original.
 */

/** Cleaned text, with the span of the original that each of its characters was cleaned from. */
export interface Cleaned {
	text: string;
	from: number[];
	to: number[];
}

/** The span of the original a stretch of the cleaned text came from, whole markup and all. */
export function originalSpan(cleaned: Cleaned, start: number, end: number): { start: number; end: number } {
	return { start: cleaned.from[start], end: cleaned.to[end - 1] };
}

/**
 * One cleaning step: every match of `pattern` is replaced, and each character of a replacement
 * maps to the whole span the match came from, so a passage never starts or ends inside markup.
 */
function rewrite(cleaned: Cleaned, pattern: RegExp, replace: (...groups: string[]) => string): Cleaned {
	const out: Cleaned = { text: "", from: [], to: [] };
	let copied = 0;
	const copy = (start: number, end: number) => {
		out.text += cleaned.text.slice(start, end);
		for (let i = start; i < end; i++) {
			out.from.push(cleaned.from[i]);
			out.to.push(cleaned.to[i]);
		}
	};
	for (const match of cleaned.text.matchAll(pattern)) {
		const start = match.index ?? 0;
		const end = start + match[0].length;
		if (end === start) continue;
		copy(copied, start);
		const replacement = replace(...match);
		for (let i = 0; i < replacement.length; i++) {
			out.from.push(cleaned.from[start]);
			out.to.push(cleaned.to[end - 1]);
		}
		out.text += replacement;
		copied = end;
	}
	if (copied === 0) return cleaned;
	copy(copied, cleaned.text.length);
	return out;
}

function host(url: string): string {
	try {
		return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return url.toLowerCase();
	}
}

// Link and image text may hold one level of brackets ("Tools [With Use Cases]"), and URLs one level
// of parentheses (".../Nike_(mythology)").
const TEXT = String.raw`((?:[^\[\]\n]|\[[^\[\]\n]*\])*)`;
const URL_PART = String.raw`((?:[^()\s]|\([^()\s]*\))*)`;
const IMAGE = new RegExp(String.raw`!\[${TEXT}\]\(${URL_PART}\)`, "g");
const LINK = new RegExp(String.raw`\[${TEXT}\]\(${URL_PART}\)`, "g");

export const INLINE_DATA = /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;
const DOMAIN = /^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;
const CITATION_NUMBER = /^\[?\^?\d+\^?\]?$/;
const ENTITIES: Record<string, string> = {
	amp: "&",
	quot: '"',
	apos: "'",
	lt: "<",
	gt: ">",
	nbsp: " ",
	ndash: "–",
	mdash: "—",
};

/**
 * Images become text first, so a link wrapping one has no nested brackets left. A favicon chip
 * keeps the site it cites, so a brand cited only that way still reads as mentioned; other images
 * keep their caption, which can name a product.
 */
export function cleanAnswer(answer: string): Cleaned {
	const steps: [RegExp, (...groups: string[]) => string][] = [
		[/\\([!-/:-@[-`{-~])/g, (_, char) => char],
		[
			/&(?:(amp|quot|apos|lt|gt|nbsp|ndash|mdash)|#(\d+));/g,
			(_, name, code) => ENTITIES[name] ?? (Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : ""),
		],
		[/<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi, () => ""],
		// Citation tokens some answers carry: "【4†source】", private-use markers, "[^1^]".
		[/【[^】\n]*】|[-]|\[\^\d+\^?\]/g, () => ""],
		[
			IMAGE,
			(_, caption, url) => {
				const cited = /favicons\?domain=([^&]+)/.exec(url)?.[1];
				if (cited) return `(${host(decodeURIComponent(cited))})`;
				return caption.trim() ? `(image: ${caption.trim()})` : "";
			},
		],
		[INLINE_DATA, () => ""],
		[
			LINK,
			(_, text, url) => {
				// A relative link (shopping carousels) points at no site.
				if (!url || url.startsWith("/")) return text;
				// A citation chip: its text is the site, or a footnote number.
				if (DOMAIN.test(text.trim())) return host(text.trim());
				if (!text.trim() || CITATION_NUMBER.test(text.trim())) return `(${host(url)})`;
				return `${text} (${host(url)})`;
			},
		],
		// Links the answer itself broke (a URL with spaces, text over several lines) keep their text.
		[/\[([^\]]{0,200}?)\]\([^)\n[]{0,2000}\)/g, (_, text) => text.split(/\s+/).join(" ").trim()],
		[/https?:\/\/[^\s)\]]+/g, (url) => host(url)],
		// A line can't start a sentence with a comma or a full stop, so it continues the one before (some
		// sources split a sentence into blocks around each citation); nor can a soft-wrapped line.
		[/[ \t]*\n(?:[ \t]*\n)*[ \t]*(?=[,;:)]|\.(?:\s|$))|(?<=\S)[ \t]*\n[ \t]*(?=\p{Ll})/gu, () => " "],
		[/^[ \t]+|[ \t]+$/gm, () => ""],
		[/[ \t]{2,}/g, () => " "],
		[/\n{3,}/g, () => "\n\n"],
		[/^\s+|\s+$/g, () => ""],
	];
	const start: Cleaned = { text: answer, from: [], to: [] };
	for (let i = 0; i < answer.length; i++) {
		start.from.push(i);
		start.to.push(i + 1);
	}
	return steps.reduce((cleaned, [pattern, replace]) => rewrite(cleaned, pattern, replace), start);
}
