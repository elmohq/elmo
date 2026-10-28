import { googleHost } from "../citations/domain-categories";
import { extractCitations } from "../text-extraction";

/**
 * Some engines cite a source through a redirect instead of linking to it: Gemini
 * through Vertex AI's grounding redirect, Google AI Overview and AI Mode through
 * Google's outbound-click `/goto?url=<token>`. Left alone, every such citation is
 * credited to google.com. The tokens expire, so this has to happen when the run
 * is fetched; the stored output is rewritten in place so that replaying
 * extraction later reads the real sources too.
 */
const GROUNDING_REDIRECT_PREFIX = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/";
const RESOLVE_TIMEOUT_MS = 8000;

/** Where a Google wrapper names its destination in the clear, so no request is needed. */
function plainDestination(url: string): string | null {
	if (!googleHost(url)) return null;
	try {
		const u = new URL(url);
		if (!/^\/(url|goto)\/?$/.test(u.pathname)) return null;
		for (const param of ["q", "url"]) {
			const value = u.searchParams.get(param);
			if (value && /^https?:\/\//i.test(value)) return storableUrl(value);
		}
	} catch {
		return null;
	}
	return null;
}

/**
 * Only the wrappers whose destination is an opaque token are followed. Ad clicks
 * (`/aclk`) are deliberately not: following one would bill the advertiser.
 */
function needsHop(url: string): boolean {
	if (url.startsWith(GROUNDING_REDIRECT_PREFIX)) return true;
	if (!googleHost(url)) return false;
	try {
		return /^\/goto\/?$/.test(new URL(url).pathname);
	} catch {
		return false;
	}
}

/**
 * The destination is spliced back into payload strings that may themselves be
 * serialized JSON or markdown, so anything that could break out of one is refused.
 */
function storableUrl(url: string): string | null {
	try {
		const href = new URL(url).href;
		return /^https?:\/\//.test(href) && !/["\\\s<>]/.test(href) ? href : null;
	} catch {
		return null;
	}
}

/** One manual hop: read the Location header without downloading the destination page. */
async function followOneHop(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, {
			method: "GET",
			redirect: "manual",
			signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
		});
		const location = res.headers.get("location");
		if (!location) return null;
		const next = new URL(location, url).href;
		const destination = plainDestination(next) ?? storableUrl(next);
		// A consent or sign-in interstitial, or another wrapper, is no better than what we had.
		if (!destination || needsHop(destination) || googleHost(destination)?.startsWith("consent.")) return null;
		return destination;
	} catch {
		return null;
	}
}

// Prompts run concurrently and Google AI surfaces cite the same pages across
// them, so a lookup already underway is shared rather than repeated.
const inflight = new Map<string, Promise<string | null>>();

function resolveOnce(url: string): Promise<string | null> {
	const pending = inflight.get(url);
	if (pending) return pending;
	const lookup = followOneHop(url).finally(() => inflight.delete(url));
	inflight.set(url, lookup);
	return lookup;
}

async function destinationOf(url: string): Promise<string | null> {
	return plainDestination(url) ?? (needsHop(url) ? resolveOnce(url) : null);
}

// Inside a longer string a URL ends where URL characters stop, so one token
// that happens to prefix another is never spliced into the middle of it.
const URL_CONTINUES = "(?![\\w\\-.~%=&+/?#])";

function replacer(replacements: Map<string, string>): (value: string) => string {
	const escaped = [...replacements.keys()].map((url) => url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const pattern = new RegExp(`(?:${escaped.join("|")})${URL_CONTINUES}`, "g");
	return (value) => replacements.get(value) ?? value.replace(pattern, (match) => replacements.get(match) ?? match);
}

function rewriteStrings(node: unknown, rewrite: (value: string) => string): void {
	if (!node || typeof node !== "object") return;
	const record = node as Record<string, unknown>;
	for (const [key, child] of Object.entries(record)) {
		if (typeof child === "string") record[key] = rewrite(child);
		else rewriteStrings(child, rewrite);
	}
}

/**
 * Replace every redirect a run cites with the page it leads to. Only URLs the
 * extractor reads as citations are looked up, so links elsewhere in a payload
 * never cost a request. A redirect that can't be resolved stays as it was:
 * a citation credited to Google beats losing the run over it.
 */
export async function resolveCitationRedirects(rawOutput: unknown, extractorKey: string): Promise<void> {
	const cited = [...new Set(extractCitations(rawOutput, extractorKey).map((c) => c.url))];
	const replacements = new Map<string, string>();
	await Promise.all(
		cited.map(async (url) => {
			const destination = await destinationOf(url);
			if (destination && destination !== url) replacements.set(url, destination);
		}),
	);
	if (replacements.size > 0) rewriteStrings(rawOutput, replacer(replacements));
}
