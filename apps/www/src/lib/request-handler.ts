import { CLOUD_APP_URL } from "@workspace/config/referrals";
import { AD_TAG_CSP } from "@workspace/ui/lib/ad-tags";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { CAL_EMBED_CSP } from "@/lib/cal-embed";
import { MARKDOWN_CONTENT_TYPE, markdownNotFound } from "@/lib/get-llm-text";
import { htmlToMarkdown } from "@/lib/html-to-markdown";
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

const FILE_LIKE = /\.[^/]+$/;

function addDiscoveryLinks(response: Response, path: string): void {
	const type = response.headers.get("Content-Type") ?? "";
	if (!type.startsWith("text/html") && !type.startsWith("text/markdown")) return;
	const alternate = response.ok && !FILE_LIKE.test(path) ? `${path.replace(/\/+$/, "") || "/index"}.md` : undefined;
	response.headers.set(
		"Link",
		alternate ? `${DISCOVERY_LINKS}, <${alternate}>; rel="alternate"; type="text/markdown"` : DISCOVERY_LINKS,
	);
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
	for (const { base, indexIsPage, stripMd, stripMdx } of MARKDOWN_SOURCES) {
		if (!indexIsPage && (path === `${base}.md` || path === `${base}.mdx`)) continue;
		const target = stripMd(path) || stripMdx(path);
		if (target) return target;
	}
}

function negotiableMarkdownRoute(path: string): string | undefined {
	for (const { base, indexIsPage, toMarkdown } of MARKDOWN_SOURCES) {
		if (path === base && !indexIsPage) continue;
		if (path !== base && !path.startsWith(`${base}/`)) continue;
		const target = toMarkdown(path);
		if (target) return target;
	}
}

function pageBehindMarkdownSuffix(path: string): string | undefined {
	if (!path.endsWith(".md")) return undefined;
	const page = path.slice(0, -".md".length);
	return page === "/index" ? "/" : page;
}

// Keep permanent redirects server-side so backlinks and ranking signals reach
// the canonical replacement rather than a client-rendered not-found page.
const PERMANENT_REDIRECTS: Record<string, string> = {
	"/blog/aeo-agent-skill": "/blog/aeo-skill",
	"/blog/ai-search-engines": "/blog/best-ai-search-engine",
	"/blog/ai-search-glossary": "/glossary",
	"/blog/answer-engine-optimization": "/answer-engine-optimization",
	"/blog/best-open-source-aeo-tools": "/ai-visibility-tools/category/open-source",
	"/blog/generative-ai-for-marketing": "/blog/ai-for-seo",
	"/blog/generative-ai-seo": "/generative-engine-optimization",
	"/blog/generative-engine-optimization": "/generative-engine-optimization",
	"/blog/geo-vs-seo": "/blog/aeo-vs-seo",
	"/blog/google-ai-overviews": "/ai-search/google-ai-overviews",
	"/blog/how-long-does-it-take-to-get-cited-by-ai": "/blog/how-long-to-get-cited-by-ai",
	"/blog/how-to-appear-in-chatgpt": "/ai-search/chatgpt",
	"/blog/how-to-appear-in-google-gemini": "/ai-search/gemini",
	"/blog/how-to-rank-in-perplexity": "/ai-search/perplexity",
	"/blog/iab-ai-visibility-framework": "/blog/iab-ai-visibility-metrics",
	"/blog/llm-optimization": "/glossary/llmo",
	"/blog/llm-seo": "/glossary/llmo",
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

// This origin is not an OAuth issuer, so it points agents that start from the
// brand domain at the app rather than serving a copy whose issuer would not match.
const DISCOVERY_REDIRECTS: Record<string, string> = {
	"/.well-known/oauth-authorization-server": `${CLOUD_APP_URL}/.well-known/oauth-authorization-server`,
	"/.well-known/oauth-protected-resource": `${CLOUD_APP_URL}/.well-known/oauth-protected-resource`,
};

function redirectFor(url: URL): Response | undefined {
	const movedTo = PERMANENT_REDIRECTS[url.pathname.replace(/\/+$/, "") || "/"];
	if (movedTo) return new Response(null, { status: 308, headers: { Location: `${movedTo}${url.search}` } });

	const servedElsewhere = DISCOVERY_REDIRECTS[url.pathname];
	if (servedElsewhere) return new Response(null, { status: 307, headers: { Location: servedElsewhere } });
}

const MARKDOWN_MEDIA_TYPES = ["text/markdown", "text/x-markdown"];

type Upstream = (request: Request) => Response | Promise<Response>;

function at(request: Request, path: string, init?: RequestInit): Request {
	const url = new URL(request.url);
	url.pathname = path;
	return new Request(url, init ?? request);
}

function withoutBodyForHead(request: Request, response: Response): Response {
	return request.method === "HEAD" ? new Response(null, response) : response;
}

/** Pages outside the MDX sources have no markdown twin, so their rendered HTML is
 * converted instead. */
async function renderAsMarkdown(upstream: Upstream, request: Request, path: string): Promise<Response> {
	// llms.txt is the site overview the homepage's marketing layout converts poorly into.
	if (path === "/") {
		return withoutBodyForHead(request, new Response(llmsTxt, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE } }));
	}

	const headers = new Headers(request.headers);
	headers.set("Accept", "text/html");
	const page = at(request, path, { method: "GET", headers, signal: request.signal });
	const response = await upstream(page);

	if (response.status === 404) return withoutBodyForHead(request, markdownNotFound());
	if (!response.ok || !response.headers.get("Content-Type")?.startsWith("text/html")) return response;

	const markdown = htmlToMarkdown(await response.text(), page.url);
	return withoutBodyForHead(request, new Response(markdown, { headers: { "Content-Type": MARKDOWN_CONTENT_TYPE } }));
}

async function respond(upstream: Upstream, request: Request, path: string, wantsMarkdown: boolean) {
	const twin = suffixedMarkdownRoute(path) ?? (wantsMarkdown ? negotiableMarkdownRoute(path) : undefined);
	if (twin) return upstream(at(request, twin));
	if (wantsMarkdown) return renderAsMarkdown(upstream, request, path);

	const response = await upstream(request);
	const isReadable = request.method === "GET" || request.method === "HEAD";
	const page = isReadable && response.status === 404 ? pageBehindMarkdownSuffix(path) : undefined;
	return page ? renderAsMarkdown(upstream, request, page) : response;
}

export function createRequestHandler(upstream: Upstream) {
	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const redirect = redirectFor(url);
		if (redirect) return addSecurityHeaders(redirect);

		const path = url.pathname;
		const isPage = (request.method === "GET" || request.method === "HEAD") && !FILE_LIKE.test(path);
		const wantsMarkdown = isPage && isMarkdownPreferred(request, { markdownMediaTypes: MARKDOWN_MEDIA_TYPES });

		const response = await respond(upstream, request, path, wantsMarkdown);
		if (isPage) response.headers.set("Vary", "Accept");
		addDiscoveryLinks(response, path);
		return addSecurityHeaders(response);
	};
}
