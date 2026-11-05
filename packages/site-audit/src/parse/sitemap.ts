export interface SitemapEntry {
	loc: string;
	lastmod?: string;
}

interface ParsedSitemap {
	kind: "urlset" | "index" | "invalid";
	entries: SitemapEntry[];
}

function decode(value: string): string {
	return value
		.replace(/^<!\[CDATA\[|\]\]>$/g, "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&")
		.trim();
}

// The sitemaps protocol caps a file at 50,000 entries.
const MAX_ENTRIES = 50_000;

function localName(tag: string): string {
	const name = tag.replace(/^\//, "").split(/[\s/]/, 1)[0] ?? "";
	return name.slice(name.indexOf(":") + 1);
}

// A single forward scan, so a crafted sitemap (say, thousands of unclosed <url> tags) costs linear
// time rather than the quadratic rescanning a backtracking regex would do.
export function parseSitemap(xml: string): ParsedSitemap {
	const lower = xml.toLowerCase();
	let kind: ParsedSitemap["kind"] = "invalid";
	const entries: SitemapEntry[] = [];
	let current: Partial<SitemapEntry> | undefined;
	let pos = 0;
	while (entries.length < MAX_ENTRIES) {
		const open = lower.indexOf("<", pos);
		const close = open === -1 ? -1 : lower.indexOf(">", open);
		if (close === -1) break;
		const tag = lower.slice(open + 1, close).trim();
		pos = close + 1;
		if (tag.startsWith("?") || tag.startsWith("!")) continue;
		const name = localName(tag);
		const closing = tag.startsWith("/");
		if (kind === "invalid" && !closing) {
			if (name === "urlset") kind = "urlset";
			else if (name === "sitemapindex") kind = "index";
			continue;
		}
		if (name === (kind === "index" ? "sitemap" : "url")) {
			if (closing && current?.loc) entries.push({ loc: current.loc, lastmod: current.lastmod });
			current = closing ? undefined : {};
		} else if ((name === "loc" || name === "lastmod") && !closing && current) {
			const end = lower.indexOf("</", pos);
			if (end === -1) break;
			current[name] = decode(xml.slice(pos, end));
			pos = end;
		}
	}
	return { kind, entries };
}
