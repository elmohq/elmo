import { aiCrawlerAccess } from "./robots";
import { safeFetch } from "./safe-fetch";
import type { SiteSignals } from "./types";

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
	return text
		.replace(/&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|([a-z]+));/gi, (entity, hex?: string, dec?: string, name?: string) => {
			if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
			const codePoint = hex ? Number.parseInt(hex, 16) : Number(dec);
			return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
		})
		.replace(/\s+/g, " ")
		.trim();
}

function metaContent(html: string, key: string): string {
	for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
		const name = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
		if (name !== key) continue;
		const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
		if (content) return decodeEntities(content[1] ?? content[2] ?? "");
	}
	return "";
}

function collectTypes(node: unknown, into: Set<string>): void {
	if (Array.isArray(node)) {
		for (const item of node) collectTypes(item, into);
		return;
	}
	if (!node || typeof node !== "object") return;
	const record = node as Record<string, unknown>;
	const type = record["@type"];
	for (const value of Array.isArray(type) ? type : [type]) {
		if (typeof value === "string") into.add(value);
	}
	if (record["@graph"]) collectTypes(record["@graph"], into);
}

export function parseHomepage(html: string): Pick<SiteSignals, "title" | "description" | "structuredDataTypes"> {
	const title =
		decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || metaContent(html, "og:title");
	const description = metaContent(html, "description") || metaContent(html, "og:description");
	const types = new Set<string>();
	for (const match of html.matchAll(
		/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
	)) {
		try {
			collectTypes(JSON.parse(match[1]), types);
		} catch {}
	}
	return {
		title: title.slice(0, 200),
		description: description.slice(0, 400),
		structuredDataTypes: [...types].slice(0, 12),
	};
}

function looksLikeHtml(contentType: string, text: string): boolean {
	return contentType.includes("text/html") || /^\s*<(!doctype|html)/i.test(text);
}

export async function checkSite(host: string): Promise<SiteSignals> {
	const origin = `https://${host}`;
	const [homepage, robots, llms] = await Promise.allSettled([
		safeFetch(`${origin}/`),
		safeFetch(`${origin}/robots.txt`, { maxBytes: 256 * 1024 }),
		safeFetch(`${origin}/llms.txt`, { maxBytes: 64 * 1024 }),
	]);

	const page = homepage.status === "fulfilled" && homepage.value.status < 400 ? homepage.value : null;
	const parsed = page ? parseHomepage(page.text) : { title: "", description: "", structuredDataTypes: [] };

	let robotsTxt: string | null = null;
	let robotsState: SiteSignals["robotsTxt"] = "unreachable";
	if (robots.status === "fulfilled") {
		const { status, contentType, text } = robots.value;
		if (status >= 400 && status < 500) {
			robotsTxt = "";
			robotsState = "missing";
		} else if (status < 300 && !looksLikeHtml(contentType, text)) {
			robotsTxt = text;
			robotsState = "found";
		} else if (status < 300) {
			robotsTxt = "";
			robotsState = "missing";
		}
	}

	const llmsTxt =
		llms.status === "fulfilled" &&
		llms.value.status === 200 &&
		!looksLikeHtml(llms.value.contentType, llms.value.text) &&
		llms.value.text.trim().length > 0;

	return {
		homepageReachable: page !== null,
		...parsed,
		robotsTxt: robotsState,
		llmsTxt,
		crawlers: aiCrawlerAccess(robotsTxt).map(({ crawler, access }) => ({ ...crawler, access })),
	};
}
