import { AD_TAG_CSP } from "@workspace/ui/lib/ad-tags";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { CAL_EMBED_CSP } from "@/lib/cal-embed";
import { MARKDOWN_CONTENT_TYPE, markdownNotFound } from "@/lib/get-llm-text";
import { llmsTxt } from "@/lib/llms-txt";

const SECURITY_HEADERS: Record<string, string> = {
	"Content-Security-Policy": [
		"default-src 'self'",
		`script-src 'self' 'unsafe-inline' https://var.elmohq.com https://*.crisp.chat ${CAL_EMBED_CSP} ${AD_TAG_CSP.script}`,
		`style-src 'self' 'unsafe-inline' https://*.crisp.chat ${AD_TAG_CSP.style}`,
		"img-src 'self' data: https:",
		`font-src 'self' data: https://*.crisp.chat ${AD_TAG_CSP.font}`,
		`connect-src 'self' https://var.elmohq.com https://*.mux.com https://*.litix.io https://*.crisp.chat wss://*.relay.crisp.chat wss://*.relay.rescue.crisp.chat ${AD_TAG_CSP.connect}`,
		"media-src 'self' blob: https://*.mux.com https://*.crisp.chat",
		"worker-src 'self' blob: https://*.crisp.chat",
		// YouTube embeds in blog posts (privacy-enhanced youtube-nocookie host).
		`frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://*.crisp.chat ${CAL_EMBED_CSP} ${AD_TAG_CSP.frame}`,
		"object-src 'none'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join("; "),
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
};

function addSecurityHeaders(response: Response): Response {
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(key, value);
	}
	return response;
}

const DISCOVERY_LINKS = [
	`</.well-known/agent-skills/index.json>; rel="agent-skills"`,
	`</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
	`</.well-known/ard.json>; rel="ard"`,
	`</api/openapi.json>; rel="service-desc"`,
	`</docs>; rel="service-doc"; type="text/html"`,
	`</llms.txt>; rel="describedby"; type="text/plain"`,
	`</sitemap.xml>; rel="sitemap"; type="application/xml"`,
	`<https://status.elmohq.com/>; rel="status"; type="text/html"`,
	`<https://github.com/elmohq/elmo/blob/main/LICENSE.md>; rel="license"`,
].join(", ");

function isDiscoverable(response: Response): boolean {
	const type = response.headers.get("Content-Type") ?? "";
	return type.startsWith("text/html") || type.startsWith("text/markdown");
}

function addDiscoveryLinks(response: Response, markdownAlternate?: string): void {
	if (!isDiscoverable(response)) return;
	const links = markdownAlternate
		? `${DISCOVERY_LINKS}, <${markdownAlternate}>; rel="alternate"; type="text/markdown"`
		: DISCOVERY_LINKS;
	response.headers.set("Link", links);
}

const MARKDOWN_SOURCES = [
	{ base: "/docs", indexIsPage: true },
	{ base: "/blog", indexIsPage: false },
].map(({ base, indexIsPage }) => ({
	base,
	indexIsPage,
	stripMd: rewritePath(`${base}{/*path}.md`, `/llms.mdx${base}{/*path}`).rewrite,
	stripMdx: rewritePath(`${base}{/*path}.mdx`, `/llms.mdx${base}{/*path}`).rewrite,
	toMarkdown: rewritePath(`${base}{/*path}`, `/llms.mdx${base}{/*path}`).rewrite,
}));

function suffixedMarkdownRoute(path: string): string | undefined {
	for (const source of MARKDOWN_SOURCES) {
		const target = source.stripMd(path) || source.stripMdx(path);
		if (target) return target;
	}
}

function negotiableMarkdownRoute(path: string): string | undefined {
	// A file-like path is a server route (the RSS feed, an image), not a page
	// with a markdown twin.
	if (/\.[^/]+$/.test(path)) return undefined;
	for (const { base, indexIsPage, toMarkdown } of MARKDOWN_SOURCES) {
		if (path === base && !indexIsPage) continue;
		if (path !== base && !path.startsWith(`${base}/`)) continue;
		const target = toMarkdown(path);
		if (target) return target;
	}
}

function withAcceptHtml(request: Request): Request {
	const headers = new Headers(request.headers);
	headers.set("Accept", "text/html");
	return new Request(request.url, { method: request.method, headers, signal: request.signal });
}

// Keep permanent redirects server-side so backlinks and ranking signals reach
// the canonical replacement rather than a client-rendered not-found page.
const PERMANENT_REDIRECTS: Record<string, string> = {
	"/blog/answer-engine-optimization": "/answer-engine-optimization",
	"/blog/best-open-source-aeo-tools": "/ai-visibility-tools/category/open-source",
	"/blog/generative-ai-for-marketing": "/blog/ai-for-seo",
	"/blog/track-brand-ai-search": "/answer-engine-optimization",
	"/blog/what-is-generative-seo": "/generative-engine-optimization",
	"/docs/mcp": "/docs/api/mcp",
	// The URLs people (and ad platforms, and app stores) guess for these.
	"/terms": "/legal/terms",
	"/privacy": "/legal/privacy",
	"/cookies": "/legal/cookies",
	"/subprocessors": "/legal/subprocessors",
	"/acceptable-use": "/legal/acceptable-use",
};

const MARKDOWN_MEDIA_TYPES = ["text/markdown", "text/x-markdown", "text/plain"];
const NEGOTIABLE_TYPES = ["text/html", ...MARKDOWN_MEDIA_TYPES];

interface AcceptRange {
	mediaType: string;
	quality: number;
	/** Media-type parameters other than `q` and `charset`, which narrow the range
	 * to representations carrying them — and ours carry none. */
	narrowed: boolean;
}

function parseAccept(accept: string): AcceptRange[] {
	return accept.split(",").flatMap((section) => {
		const [range, ...params] = section.split(";").map((part) => part.replace(/\s/g, "").toLowerCase());
		if (!range) return [];
		const qIndex = params.findIndex((param) => param.startsWith("q="));
		const quality = qIndex === -1 ? 1 : Number.parseFloat(params[qIndex].slice(2));
		// Anything after `q` is an accept-extension, not a media-type parameter.
		const mediaParams = qIndex === -1 ? params : params.slice(0, qIndex);
		return [
			{
				mediaType: range,
				quality: Number.isNaN(quality) ? 1 : quality,
				narrowed: mediaParams.some((param) => param !== "" && !param.startsWith("charset=")),
			},
		];
	});
}

/**
 * RFC 9110 §12.5.1: each type is scored by the most specific Accept range that
 * matches it, so `text/*;q=0, text/html` still accepts HTML. A missing or empty
 * header constrains nothing.
 */
function acceptsAnyOf(accept: string | null, types: string[]): boolean {
	if (!accept?.trim()) return true;
	const ranges = parseAccept(accept).filter((range) => !range.narrowed);
	return types.some((type) => {
		const [major] = type.split("/");
		const match =
			ranges.find((r) => r.mediaType === type) ??
			ranges.find((r) => r.mediaType === `${major}/*`) ??
			ranges.find((r) => r.mediaType === "*/*");
		return (match?.quality ?? 0) > 0;
	});
}

function notAcceptable(request: Request): Response {
	return new Response(
		`Not Acceptable\n\nThis resource is available in:\n- text/html\n- text/markdown\n\nYou requested: ${request.headers.get("Accept")}\n`,
		{ status: 406, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
	);
}

function markdownResponse(request: Request, body: string): Response {
	return new Response(request.method === "HEAD" ? null : body, {
		headers: { "Content-Type": MARKDOWN_CONTENT_TYPE },
	});
}

type Upstream = (request: Request) => Response | Promise<Response>;

function permanentRedirect(url: URL): Response | undefined {
	const movedTo = PERMANENT_REDIRECTS[url.pathname.replace(/\/+$/, "") || "/"];
	if (movedTo) return new Response(null, { status: 308, headers: { Location: `${movedTo}${url.search}` } });
}

/** Hands the request to the app, at the markdown route when there is one. A page
 * with no markdown variant renders as HTML, except a missing one, whose 404 an
 * agent can still read. */
async function serveFromApp(upstream: Upstream, request: Request, target: string | undefined, wantsMarkdown: boolean) {
	let req = request;
	if (target) {
		const url = new URL(request.url);
		url.pathname = target;
		req = new Request(url, request);
	} else if (wantsMarkdown) {
		req = withAcceptHtml(request);
	}
	const response = await upstream(req);
	const isMarkdown = response.headers.get("Content-Type")?.startsWith("text/markdown");
	if (!wantsMarkdown || response.status !== 404 || isMarkdown) return response;
	const notFound = markdownNotFound();
	return request.method === "HEAD" ? new Response(null, notFound) : notFound;
}

/** How a request for `path` is answered, decided before the app sees it. */
function planFor(request: Request, path: string) {
	const readable = request.method === "GET" || request.method === "HEAD";
	// An explicit .md / .mdx suffix always serves markdown, ignoring Accept.
	const suffixed = suffixedMarkdownRoute(path);
	const negotiable = suffixed ? undefined : negotiableMarkdownRoute(path);
	const isHome = path === "/";
	const wantsMarkdown =
		!suffixed && readable && isMarkdownPreferred(request, { markdownMediaTypes: MARKDOWN_MEDIA_TYPES });
	return {
		readable,
		negotiable,
		varies: isHome || negotiable !== undefined,
		homeMarkdown: isHome && wantsMarkdown,
		wantsMarkdown,
		target: suffixed ?? (wantsMarkdown ? negotiable : undefined),
	};
}

export function createRequestHandler(upstream: Upstream) {
	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const redirect = permanentRedirect(url);
		if (redirect) return addSecurityHeaders(redirect);

		const plan = planFor(request, url.pathname);
		let response: Response;
		if (plan.varies && plan.readable && !acceptsAnyOf(request.headers.get("Accept"), NEGOTIABLE_TYPES)) {
			response = notAcceptable(request);
		} else if (plan.homeMarkdown) {
			response = markdownResponse(request, llmsTxt);
		} else {
			response = await serveFromApp(upstream, request, plan.target, plan.wantsMarkdown);
		}

		// A 404 body follows Accept too, so caches must key every one on it.
		if (plan.varies || (plan.readable && response.status === 404)) response.headers.set("Vary", "Accept");
		addDiscoveryLinks(response, plan.negotiable ? `${url.pathname}.md` : undefined);
		return addSecurityHeaders(response);
	};
}
