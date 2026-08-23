/**
 * The few facts the llms.txt generator needs from a page: what it is called and
 * what it is about. Regex rather than a parser because we only ever read a
 * truncated `<head>` and never render the result as HTML.
 *
 * Pure — no network, no Node built-ins.
 */

export interface PageMeta {
	title: string | null;
	description: string | null;
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	mdash: "—",
	ndash: "–",
	hellip: "…",
	rsquo: "’",
	lsquo: "‘",
	rdquo: "”",
	ldquo: "“",
};

function decodeHtmlEntities(value: string): string {
	return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
		if (entity.startsWith("#")) {
			const code = entity[1]?.toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
			return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
		}
		return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
	});
}

function clean(value: string | undefined): string | null {
	if (!value) return null;
	const text = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
	return text || null;
}

function findMetaContent(html: string, attribute: "name" | "property", value: string): string | null {
	const pattern = new RegExp(`<meta\\b[^>]*\\b${attribute}\\s*=\\s*["']${value}["'][^>]*>`, "i");
	const tag = html.match(pattern)?.[0];
	if (!tag) return null;
	return clean(tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1]);
}

export function extractPageMeta(html: string): PageMeta {
	const head = html.slice(0, 200_000);
	const title =
		clean(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) ?? findMetaContent(head, "property", "og:title");
	const description =
		findMetaContent(head, "name", "description") ?? findMetaContent(head, "property", "og:description");

	return { title, description };
}

/**
 * Fallback title for a page we could not fetch: the last path segment, made
 * readable. `/blog/ai-crawler-checker/` becomes "Ai crawler checker" — worse
 * than the real `<title>`, still better than a bare URL in a link list.
 */
export function titleFromUrl(url: string): string {
	let pathname: string;
	try {
		pathname = new URL(url).pathname;
	} catch {
		pathname = url;
	}

	const segment = pathname.split("/").filter(Boolean).pop();
	if (!segment) return "Home";

	const words = decodeURIComponent(segment)
		.replace(/\.(html?|php|aspx?)$/i, "")
		.replace(/[-_]+/g, " ")
		.trim();

	if (!words) return "Home";
	return words.charAt(0).toUpperCase() + words.slice(1);
}
