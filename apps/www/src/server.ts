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

// Serve the raw markdown for an MDX page from the matching /llms.mdx/* route.
// Three things resolve to the same markdown, all via an internal rewrite (the
// URL the client sees never changes — no redirect):
//   • /docs/foo.md  and  /docs/foo.mdx  — explicit suffix, always markdown
//   • /docs/foo  with `Accept: text/markdown` — content negotiation for agents
// Pages are resolved by slug, so the `.md` suffix works even though every
// source file is `.mdx`. See https://fumadocs.dev/docs/integrations/llms#accept
const MARKDOWN_SOURCES = [
	// The docs index is itself an MDX page. The blog index is a generated
	// listing, so /blog has no markdown twin while /blog/a-post does.
	{ base: "/docs", indexIsPage: true },
	{ base: "/blog", indexIsPage: false },
].map(({ base, indexIsPage }) => ({
	base,
	indexIsPage,
	stripMd: rewritePath(`${base}{/*path}.md`, `/llms.mdx${base}{/*path}`).rewrite,
	stripMdx: rewritePath(`${base}{/*path}.mdx`, `/llms.mdx${base}{/*path}`).rewrite,
	toMarkdown: rewritePath(`${base}{/*path}`, `/llms.mdx${base}{/*path}`).rewrite,
}));

/** The markdown route for `path`, when an explicit .md/.mdx suffix asks for it. */
function suffixedMarkdownRoute(path: string): string | undefined {
	for (const source of MARKDOWN_SOURCES) {
		const target = source.stripMd(path) || source.stripMdx(path);
		if (target) return target;
	}
}

/** The markdown route for `path`, when it is a page an agent can negotiate for. */
function negotiableMarkdownRoute(path: string): string | undefined {
	for (const { base, indexIsPage, toMarkdown } of MARKDOWN_SOURCES) {
		if (path === base && !indexIsPage) continue;
		if (path !== base && !path.startsWith(`${base}/`)) continue;
		const target = toMarkdown(path);
		if (target) return target;
	}
}

/**
 * The server runtime has its own Request class, which the global Request
 * constructor rejects as an input, so overriding a header means rebuilding the
 * request from its parts. Bodyless methods only — nothing else needs this.
 */
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
			// Every other page only renders HTML, and the document renderer answers
			// 500 to any request that doesn't accept it. Ask for HTML on the agent's
			// behalf so it gets the page instead of an error.
			req = withAcceptHtml(request);
		}

		const response = await handler.fetch(req);
		// A bare page URL resolves to either HTML or markdown depending on the
		// Accept header, so shared caches must key both representations on it.
		if (negotiable) response.headers.set("Vary", "Accept");
		return addSecurityHeaders(response);
	},
});
