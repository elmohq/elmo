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
			.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "")
			// A relative link (shopping carousels) points at no site.
			.replace(LINK, (_, text: string, url: string) => {
				if (!url || url.startsWith("/")) return text;
				return text.trim() ? `${text} (${host(url)})` : `(${host(url)})`;
			})
			// Links the answer itself broke (a URL with spaces, text over several lines) keep their text.
			.replace(/\[([^\]]{0,200}?)\]\([^)\n]*\)/g, (_, text: string) => text.split(/\s+/).join(" ").trim())
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
 * between them. Cleaning only removes and rewrites markup, so the words are all still there.
 */
export function locatePassage(answer: string, passage: string): { start: number; end: number } | undefined {
	const words = passage
		.replace(/\(image: ([^)]*)\)/g, "$1")
		.replace(/\((?:[a-z0-9-]+\.)+[a-z]{2,}\)/g, "")
		.match(WORD);
	if (!words?.length) return undefined;
	// Searched case-insensitively in the original: lowercasing it first can change its length ("İ")
	// and shift every offset after.
	const patterns = words.map((word) => new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"));
	const find = (i: number, from: number) => {
		patterns[i].lastIndex = from;
		const match = patterns[i].exec(answer);
		return match ? { at: match.index, end: match.index + match[0].length } : null;
	};
	for (let first = find(0, 0); first; first = find(0, first.at + 1)) {
		let end = first.end;
		let found = true;
		for (let i = 1; i < patterns.length; i++) {
			const next = find(i, end);
			if (!next || next.at - end > MAX_GAP) {
				found = false;
				break;
			}
			end = next.end;
		}
		if (found) return { start: first.at, end };
	}
	return undefined;
}
