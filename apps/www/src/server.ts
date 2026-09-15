import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";

const SECURITY_HEADERS: Record<string, string> = {
	"Content-Security-Policy": [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' https://var.elmohq.com https://*.crisp.chat",
		"style-src 'self' 'unsafe-inline' https://*.crisp.chat",
		"img-src 'self' data: https:",
		"font-src 'self' data: https://*.crisp.chat",
		"connect-src 'self' https://var.elmohq.com https://*.mux.com https://*.litix.io https://*.crisp.chat wss://*.relay.crisp.chat wss://*.relay.rescue.crisp.chat",
		"media-src 'self' blob: https://*.mux.com https://*.crisp.chat",
		"worker-src 'self' blob: https://*.crisp.chat",
		// YouTube embeds in blog posts (privacy-enhanced youtube-nocookie host).
		"frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://*.crisp.chat",
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

// RFC 8288 links to the machine-readable entry points of this site, so an agent
// that fetched one page knows what else is here without guessing at well-known
// paths. Relative references so they also resolve on preview deployments.
const DISCOVERY_LINKS = [
	`</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
	`</api/openapi.json>; rel="service-desc"`,
	`</docs>; rel="service-doc"; type="text/html"`,
	`</llms.txt>; rel="describedby"; type="text/plain"`,
	`</sitemap.xml>; rel="sitemap"; type="application/xml"`,
	`<https://github.com/elmohq/elmo/blob/main/LICENSE.md>; rel="license"`,
].join(", ");

/** Only the responses an agent reads as content; assets carry no useful links. */
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
	"/blog/best-open-source-aeo-tools": "/ai-visibility-tools/category/open-source",
	"/docs/mcp": "/docs/api/mcp",
};

export default createServerEntry({
	async fetch(request) {
		const url = new URL(request.url);
		const path = url.pathname;

		const movedTo = PERMANENT_REDIRECTS[path.replace(/\/+$/, "") || "/"];
		if (movedTo) {
			return addSecurityHeaders(new Response(null, { status: 308, headers: { Location: `${movedTo}${url.search}` } }));
		}

		// An explicit .md / .mdx suffix always serves markdown, ignoring Accept.
		let target = suffixedMarkdownRoute(path);

		const negotiable = target ? undefined : negotiableMarkdownRoute(path);
		const wantsMarkdown = !target && isMarkdownPreferred(request);
		if (negotiable && wantsMarkdown) target = negotiable;

		let req = request;
		if (target) {
			url.pathname = target;
			req = new Request(url, request);
		} else if (wantsMarkdown && (request.method === "GET" || request.method === "HEAD")) {
			req = withAcceptHtml(request);
		}

		const response = await handler.fetch(req);
		if (negotiable) response.headers.set("Vary", "Accept");
		addDiscoveryLinks(response, negotiable ? `${path}.md` : undefined);
		return addSecurityHeaders(response);
	},
});
