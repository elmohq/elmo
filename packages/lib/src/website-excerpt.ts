import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const MAX_EXCERPT_LINES = 200;
const HOSTED_TIMEOUT_MS = 30_000;
const DIRECT_TIMEOUT_MS = 15_000;

// A realistic desktop-browser UA. The reader services — and especially direct
// site fetches — are less likely to be treated as bot traffic than a custom UA.
const BROWSER_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Fetch a short text excerpt of a website for brand-analysis context.
 *
 * Tries three sources in order, each requiring no API key / no login, falling
 * through to the next whenever one is blocked, rate-limited, or returns nothing:
 *
 *   1. Jina Reader (r.jina.ai)      — LLM-friendly markdown, renders JS.
 *   2. Microlink (api.microlink.io) — headless-browser markdown, renders JS.
 *   3. Backend fetch + Readability  — pull the raw HTML ourselves and extract
 *      the main content as clean text with @mozilla/readability + linkedom. This
 *      runs server-side (in the worker), so there are no CORS constraints and no
 *      third party left to rate-limit or block us.
 *
 * Jina's anonymous endpoint in particular returns 401 ("bad network
 * reputation") from some IP ranges; the later tiers keep excerpts flowing when
 * that happens. Returns "" when every source fails — callers treat an empty
 * excerpt as a best-effort miss rather than an error.
 */
export async function getWebsiteExcerpt(url: string): Promise<string> {
	if (!url) {
		return "";
	}

	// Ensure the URL has a scheme so the reader services and our own fetch all
	// resolve it consistently.
	const cleanUrl = url.startsWith("http") ? url : `https://${url}`;

	const sources = [
		{ name: "jina", fetch: () => fromJina(cleanUrl) },
		{ name: "microlink", fetch: () => fromMicrolink(cleanUrl) },
		{ name: "readability", fetch: () => fromReadability(cleanUrl) },
	];

	for (const source of sources) {
		try {
			const content = await source.fetch();
			if (content) {
				return toExcerpt(content);
			}
			console.warn(`[website-excerpt] ${source.name} returned no content for ${cleanUrl}`);
		} catch (error) {
			console.warn(`[website-excerpt] ${source.name} failed for ${cleanUrl}:`, error);
		}
	}

	console.error(`[website-excerpt] all sources failed for ${cleanUrl}`);
	return "";
}

/** Jina Reader — prepend r.jina.ai to any URL to get back clean markdown. */
async function fromJina(url: string): Promise<string | null> {
	const response = await fetch(`https://r.jina.ai/${url}`, {
		headers: { "User-Agent": BROWSER_UA },
		signal: AbortSignal.timeout(HOSTED_TIMEOUT_MS),
	});
	if (!response.ok) {
		return null;
	}
	const content = (await response.text()).trim();
	return content || null;
}

/**
 * Microlink URL-to-Markdown — anonymous, no API key. `embed=markdown` returns
 * the page as raw text/markdown; the `data.markdown.attr` recipe is what
 * Microlink's own markdown.microlink.io shortcut expands to. On rate-limit or
 * error it responds non-2xx (or a JSON error envelope), which we treat as a miss.
 */
async function fromMicrolink(url: string): Promise<string | null> {
	const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(url)}&data.markdown.attr=markdown&embed=markdown`;
	const response = await fetch(endpoint, {
		headers: { "User-Agent": BROWSER_UA },
		signal: AbortSignal.timeout(HOSTED_TIMEOUT_MS),
	});
	if (!response.ok) {
		return null;
	}
	// A successful markdown response is text/markdown; a JSON body is an error envelope.
	if ((response.headers.get("content-type") ?? "").includes("json")) {
		return null;
	}
	const content = (await response.text()).trim();
	return content || null;
}

/**
 * Last resort: fetch the raw HTML ourselves (server-side, so no CORS) and
 * extract the main article text with Readability, backed by linkedom's DOM.
 * Only handles HTML responses; falls back to whole-body text when Readability
 * can't isolate an article.
 */
async function fromReadability(url: string): Promise<string | null> {
	const response = await fetch(url, {
		headers: {
			"User-Agent": BROWSER_UA,
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		},
		signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
	});
	if (!response.ok) {
		return null;
	}
	if (!(response.headers.get("content-type") ?? "").includes("html")) {
		return null;
	}
	const html = await response.text();
	if (!html.trim()) {
		return null;
	}
	const { document } = parseHTML(html);
	const article = new Readability(document).parse();
	const text = article?.textContent?.trim();
	if (text) {
		return text;
	}
	// Readability couldn't isolate an article; fall back to all visible text.
	return document.body?.textContent?.trim() || null;
}

/** Collapse extraction output to the first N lines, matching prior behavior. */
function toExcerpt(content: string): string {
	return content.split("\n").slice(0, MAX_EXCERPT_LINES).join("\n");
}
