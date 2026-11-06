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

interface Tag {
	name: string;
	closing: boolean;
	end: number;
}

function nextTag(lower: string, from: number): Tag | undefined {
	const open = lower.indexOf("<", from);
	const close = open === -1 ? -1 : lower.indexOf(">", open);
	if (close === -1) return undefined;
	const raw = lower.slice(open + 1, close).trim();
	const markup = raw.startsWith("?") || raw.startsWith("!");
	return { name: markup ? "" : localName(raw), closing: raw.startsWith("/"), end: close + 1 };
}

function rootKind(tag: Tag): ParsedSitemap["kind"] {
	if (tag.closing) return "invalid";
	if (tag.name === "urlset") return "urlset";
	return tag.name === "sitemapindex" ? "index" : "invalid";
}

class EntryReader {
	kind: ParsedSitemap["kind"] = "invalid";
	readonly entries: SitemapEntry[] = [];
	private current: Partial<SitemapEntry> | undefined;

	/** Where scanning resumes, or undefined to stop. */
	accept(tag: Tag, xml: string, lower: string): number | undefined {
		if (this.kind === "invalid") {
			this.kind = rootKind(tag);
			return tag.end;
		}
		if (tag.name === (this.kind === "index" ? "sitemap" : "url")) {
			if (tag.closing && this.current?.loc) this.entries.push({ loc: this.current.loc, lastmod: this.current.lastmod });
			this.current = tag.closing ? undefined : {};
			return tag.end;
		}
		const field = tag.name === "loc" || tag.name === "lastmod" ? tag.name : undefined;
		if (!field || tag.closing || !this.current) return tag.end;
		const end = lower.indexOf("</", tag.end);
		if (end === -1) return undefined;
		this.current[field] = decode(xml.slice(tag.end, end));
		return end;
	}
}

// A single forward scan, so a crafted sitemap (say, thousands of unclosed <url> tags) costs linear
// time rather than the quadratic rescanning a backtracking regex would do.
export function parseSitemap(xml: string): ParsedSitemap {
	const lower = xml.toLowerCase();
	const reader = new EntryReader();
	let tag = nextTag(lower, 0);
	while (tag && reader.entries.length < MAX_ENTRIES) {
		const next = reader.accept(tag, xml, lower);
		if (next === undefined) break;
		tag = nextTag(lower, next);
	}
	return { kind: reader.kind, entries: reader.entries };
}
