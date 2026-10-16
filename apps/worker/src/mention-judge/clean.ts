/**
 * Turns a stored answer (markdown full of images, link targets and inline data) into the text the
 * judge reads, and finds a quoted passage of that text again in the original answer.
 */

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

const INLINE_DATA = /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;

/**
 * Images become text first, so a link wrapping one has no nested brackets left. A favicon chip
 * keeps the site it cites, so a brand cited only that way still reads as mentioned; other images
 * keep their caption, which can name a product.
 */
export function cleanAnswer(answer: string): string {
	return (
		answer
			.replaceAll("\\[", "[")
			.replaceAll("\\]", "]")
			.replace(IMAGE, (_, caption: string, url: string) => {
				const cited = /favicons\?domain=([^&]+)/.exec(url)?.[1];
				if (cited) return `(${host(decodeURIComponent(cited))})`;
				return caption.trim() ? `(image: ${caption.trim()})` : "";
			})
			.replace(INLINE_DATA, "")
			// A relative link (shopping carousels) points at no site.
			.replace(LINK, (_, text: string, url: string) => {
				if (!url || url.startsWith("/")) return text;
				return text.trim() ? `${text} (${host(url)})` : `(${host(url)})`;
			})
			// Links the answer itself broke (a URL with spaces, text over several lines) keep their text.
			.replace(/\[([^\]]{0,200}?)\]\([^)\n[]{0,2000}\)/g, (_, text: string) => text.split(/\s+/).join(" ").trim())
			.replace(/https?:\/\/[^\s)\]]+/g, (url) => host(url))
			.replace(/[ \t]{2,}/g, " ")
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
/** How far apart two consecutive words of a quote may sit in the original, markup between them. */
const MAX_GAP = 400;

/**
 * Where a passage of the cleaned answer lies in the original: its words in order, with any markup
 * between them. Cleaning can glue words the source wrote without a space ("The[Adidas](…)"), so a
 * few that can't be found are skipped.
 */
export function locatePassage(answer: string, passage: string): { start: number; end: number } | undefined {
	const words = passage
		.replace(/\(image: /g, " ")
		.replace(/\((?:[a-z0-9-]+\.)+[a-z]{2,}\)/g, "")
		.match(WORD);
	if (!words?.length) return undefined;
	// Searched case-insensitively in the original: lowercasing it first can change its length ("İ")
	// and shift every offset after. Markup may sit inside a word cleaning glued together: "TheAdidas"
	// from "The[Adidas](…)".
	const patterns = words.map(
		(word) =>
			new RegExp(
				`(?<![\\p{L}\\p{N}])${[...word].map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(String.raw`[\[\]*_]*`)}(?![\\p{L}\\p{N}])`,
				"giu",
			),
	);
	// Inline image data is blanked, keeping offsets, so no word is found among its letters.
	const haystack = answer.replace(INLINE_DATA, (data) => " ".repeat(data.length));
	const find = (i: number, from: number) => {
		patterns[i].lastIndex = from;
		const match = patterns[i].exec(haystack);
		return match ? { at: match.index, end: match.index + match[0].length } : null;
	};
	// Gaps are measured in visible characters, so link targets and image data don't count.
	const visible = haystack.replace(/\]\([^)\s]{0,2000}\)|https?:\/\/[^\s)\]]+/g, (markup) => " ".repeat(markup.length));
	const dense = new Uint32Array(visible.length + 1);
	for (let i = 0; i < visible.length; i++) dense[i + 1] = dense[i] + (visible.charCodeAt(i) > 32 ? 1 : 0);
	const near = (end: number, next: { at: number }) => dense[next.at] - dense[end] <= MAX_GAP;
	const allowed = Math.max(1, Math.floor(patterns.length / 10));
	let best: { start: number; end: number; skipped: number } | undefined;
	const beats = (start: number, end: number, skipped: number) =>
		!best || skipped < best.skipped || (skipped === best.skipped && end - start < best.end - best.start);
	/** Follows the words after `from`, nearest first, skipping at most `budget`; gives up once it can't win. */
	const follow = (from: number, start: number, end: number, skipped: number) => {
		for (let i = from + 1; i < patterns.length; i++) {
			const next = find(i, end);
			if (next && near(end, next)) end = next.end;
			else if (++skipped > allowed) return null;
			if (!beats(start, end, skipped)) return null;
		}
		return { start, end, skipped };
	};
	// The same words can chain loosely from an earlier occurrence, so the closest fit wins: fewest
	// words skipped, then the shortest span.
	for (let anchor = 0; anchor <= Math.min(allowed, patterns.length - 1); anchor++) {
		for (let first = find(anchor, 0); first; first = find(anchor, first.at + 1)) {
			best = follow(anchor, first.at, first.end, anchor) ?? best;
		}
	}
	return best && { start: best.start, end: best.end };
}
