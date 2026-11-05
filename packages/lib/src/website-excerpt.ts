import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const MAX_EXCERPT_LINES = 200;
const JINA_TIMEOUT_MS = 30_000;
const DIRECT_TIMEOUT_MS = 15_000;
// Only the first 200 lines are kept, so a larger body is never needed, and an endless or highly compressed one
// would otherwise exhaust memory before the timeout fires.
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

// A browser UA is less likely than a custom one to be treated as bot traffic.
const BROWSER_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Jina Reader first (it renders JS), then a direct fetch with Readability. "" when both fail. */
export async function getWebsiteExcerpt(url: string): Promise<string> {
	if (!url) {
		return "";
	}

	const cleanUrl = url.startsWith("http") ? url : `https://${url}`;

	const sources = [
		{ name: "jina", fetch: () => fromJina(cleanUrl) },
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

/** Jina reputation-blocks some anonymous IP ranges with a 401; the optional JINA_API_KEY avoids it. */
async function fromJina(url: string): Promise<string | null> {
	const headers: Record<string, string> = { "User-Agent": BROWSER_UA };
	const apiKey = process.env.JINA_API_KEY;
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}
	const response = await fetch(`https://r.jina.ai/${url}`, {
		headers,
		signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
	});
	if (!response.ok) {
		return null;
	}
	const content = (await readBounded(response)).trim();
	return content || null;
}

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
	const html = await readBounded(response);
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

async function readBounded(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return "";
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (size < MAX_RESPONSE_BYTES) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		size += value.byteLength;
	}
	await reader.cancel();
	return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_RESPONSE_BYTES));
}

/** Bound excerpts by line count without reflowing the extracted text. */
function toExcerpt(content: string): string {
	return content.split("\n").slice(0, MAX_EXCERPT_LINES).join("\n");
}
