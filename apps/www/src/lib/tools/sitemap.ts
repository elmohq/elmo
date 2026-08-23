/**
 * Sitemap XML reading, split into the pure part (parsing) and the part that
 * needs the network (walking a sitemap index). Regex over a real XML parser
 * because sitemaps are a fixed, shallow shape and the bodies are byte-capped.
 */
import { fetchRemoteText } from "./fetch-remote";

export interface ParsedSitemap {
	/** `<loc>` values from `<url>` entries. */
	urls: string[];
	/** `<loc>` values from `<sitemap>` entries — this file is an index. */
	sitemaps: string[];
}

const LOC_PATTERN = /<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/gi;

function locsWithin(xml: string, container: "url" | "sitemap"): string[] {
	const blocks = xml.match(new RegExp(`<${container}\\b[^>]*>[\\s\\S]*?</${container}>`, "gi")) ?? [];
	const found: string[] = [];

	for (const block of blocks) {
		LOC_PATTERN.lastIndex = 0;
		const match = LOC_PATTERN.exec(block);
		const loc = match?.[1]?.trim();
		if (loc) found.push(loc);
	}

	return found;
}

export function parseSitemap(xml: string): ParsedSitemap {
	return { urls: locsWithin(xml, "url"), sitemaps: locsWithin(xml, "sitemap") };
}

/** Paths that are never worth listing in an llms.txt. */
const SKIPPED_EXTENSIONS =
	/\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|zip|gz|mp4|webm|mp3|wav|woff2?|ttf|eot)$/i;

export function isContentUrl(candidate: string, origin: string): boolean {
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return false;
	}

	if (url.origin !== origin) return false;
	if (url.protocol !== "https:" && url.protocol !== "http:") return false;
	return !SKIPPED_EXTENSIONS.test(url.pathname);
}

export function canonicalizeUrl(candidate: string): string {
	const url = new URL(candidate);
	url.hash = "";
	url.search = "";
	if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
	return url.toString();
}

const SITEMAP_TIMEOUT_MS = 6_000;

/**
 * Reads a sitemap, descending into an index up to `maxSitemaps` children, and
 * returns same-origin content URLs. Bounded three ways — request count, URL
 * count, and a wall-clock deadline — because this runs in a serverless function
 * that will be killed mid-flight rather than return a partial answer, and a
 * partial answer is exactly what we want from a slow site.
 */
export async function collectSitemapUrls(
	entry: URL,
	origin: string,
	limits: { maxUrls: number; maxSitemaps: number; deadline: number },
): Promise<{ urls: string[]; truncated: boolean }> {
	const queue: URL[] = [entry];
	const seenSitemaps = new Set<string>([entry.toString()]);
	const urls = new Set<string>();
	let fetched = 0;
	let truncated = false;

	while (queue.length > 0 && fetched < limits.maxSitemaps) {
		const remaining = limits.deadline - Date.now();
		if (remaining < 1_000) {
			truncated = true;
			break;
		}

		const next = queue.shift();
		if (!next) break;
		fetched++;

		let xml: string;
		try {
			const response = await fetchRemoteText(next, {
				accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
				timeoutMs: Math.min(SITEMAP_TIMEOUT_MS, remaining),
			});
			if (!response.ok) continue;
			xml = response.body;
		} catch {
			continue;
		}

		const parsed = parseSitemap(xml);

		for (const child of parsed.sitemaps) {
			if (seenSitemaps.has(child)) continue;
			seenSitemaps.add(child);
			try {
				const childUrl = new URL(child);
				if (childUrl.origin === origin) queue.push(childUrl);
			} catch {
				// A malformed <loc> in someone else's sitemap is not our problem.
			}
		}

		for (const candidate of parsed.urls) {
			if (!isContentUrl(candidate, origin)) continue;
			if (urls.size >= limits.maxUrls) {
				truncated = true;
				break;
			}
			urls.add(canonicalizeUrl(candidate));
		}

		if (truncated) break;
	}

	if (queue.length > 0) truncated = true;

	return { urls: [...urls], truncated };
}
