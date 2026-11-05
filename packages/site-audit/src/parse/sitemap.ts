export interface SitemapEntry {
	loc: string;
	lastmod?: string;
}

export interface ParsedSitemap {
	kind: "urlset" | "index" | "invalid";
	entries: SitemapEntry[];
}

function decode(value: string): string {
	return value
		.replace(/^<!\[CDATA\[|\]\]>$/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.trim();
}

function tag(block: string, name: string): string | undefined {
	const match = block.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i"));
	return match ? decode(match[1] as string) : undefined;
}

export function parseSitemap(xml: string): ParsedSitemap {
	const isIndex = /<(?:\w+:)?sitemapindex[\s>]/i.test(xml);
	const isUrlset = /<(?:\w+:)?urlset[\s>]/i.test(xml);
	if (!isIndex && !isUrlset) return { kind: "invalid", entries: [] };
	const element = isIndex ? "sitemap" : "url";
	const blocks = xml.match(new RegExp(`<(?:\\w+:)?${element}[\\s>][\\s\\S]*?</(?:\\w+:)?${element}>`, "gi")) ?? [];
	const entries: SitemapEntry[] = [];
	for (const block of blocks) {
		const loc = tag(block, "loc");
		if (loc) entries.push({ loc, lastmod: tag(block, "lastmod") });
	}
	return { kind: isIndex ? "index" : "urlset", entries };
}
