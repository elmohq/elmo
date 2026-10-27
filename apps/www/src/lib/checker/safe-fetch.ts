import { lookup } from "node:dns/promises";
import { isPrivateAddress, parseDomainInput } from "./domain";

const MAX_REDIRECTS = 3;
const USER_AGENT =
	"Mozilla/5.0 (compatible; ElmoVisibilityChecker/1.0; +https://www.elmohq.com/tools/ai-visibility-checker)";

export interface FetchedPage {
	status: number;
	url: string;
	contentType: string;
	text: string;
}

export class BlockedUrlError extends Error {}

type Resolve = (hostname: string) => Promise<string[]>;

const resolveAll: Resolve = async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address);

/**
 * Throws unless `url` is plain http(s) on the default port and every address
 * its hostname resolves to is public. Checked on each redirect hop, since a
 * public site can redirect to an internal one.
 */
export async function assertPublicUrl(url: URL, resolve: Resolve = resolveAll): Promise<void> {
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError("Only http(s) URLs are fetched");
	if (url.port && url.port !== "80" && url.port !== "443")
		throw new BlockedUrlError("Non-standard ports are not fetched");
	if (url.username || url.password) throw new BlockedUrlError("URLs with credentials are not fetched");
	const parsed = parseDomainInput(url.hostname);
	if (!parsed.ok) throw new BlockedUrlError(parsed.error);

	let addresses: string[];
	try {
		addresses = await resolve(url.hostname);
	} catch {
		throw new BlockedUrlError(`Could not resolve ${url.hostname}`);
	}
	if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
		throw new BlockedUrlError(`${url.hostname} does not resolve to a public address`);
	}
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (total < maxBytes) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		total += value.byteLength;
	}
	await reader.cancel().catch(() => {});
	const bytes = new Uint8Array(Math.min(total, maxBytes));
	let offset = 0;
	for (const chunk of chunks) {
		const room = bytes.length - offset;
		if (room <= 0) break;
		bytes.set(chunk.subarray(0, room), offset);
		offset += Math.min(chunk.byteLength, room);
	}
	return new TextDecoder().decode(bytes);
}

/**
 * Fetch a page from a visitor-supplied site without letting the visitor aim
 * our server at anything private, hang it, or make it buffer a huge response.
 */
export async function safeFetch(
	input: string,
	{ timeoutMs = 8000, maxBytes = 512 * 1024 }: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchedPage> {
	const signal = AbortSignal.timeout(timeoutMs);
	let url = new URL(input);
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		await assertPublicUrl(url);
		const response = await fetch(url, {
			redirect: "manual",
			signal,
			headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
		});
		const location = response.headers.get("location");
		if (response.status >= 300 && response.status < 400 && location) {
			await response.body?.cancel().catch(() => {});
			url = new URL(location, url);
			continue;
		}
		return {
			status: response.status,
			url: url.toString(),
			contentType: response.headers.get("content-type") ?? "",
			text: await readCapped(response, maxBytes),
		};
	}
	throw new BlockedUrlError("Too many redirects");
}
