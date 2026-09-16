import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { estimateTokens, htmlToMarkdown } from "@/lib/html-to-markdown";

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

function markdownAlternate(path: string): string | undefined {
	if (path.endsWith(".md")) return undefined;
	return path === "/" ? "/index.md" : `${path}.md`;
}

function addAgentHeaders(response: Response, path: string): void {
	const type = response.headers.get("Content-Type") ?? "";
	if (!type.startsWith("text/html") && !type.startsWith("text/markdown")) return;

	response.headers.set("Vary", "Accept");
	const alternate = markdownAlternate(path);
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

function withAcceptHtml(request: Request, url: URL): Request {
	const headers = new Headers(request.headers);
	headers.set("Accept", "text/html");
	return new Request(url, { method: request.method, headers, signal: request.signal });
}

// Routes that are markdown documents in their own right, so stripping the
// suffix would send them to a page that does not exist.
const MARKDOWN_DOCUMENTS = new Set(["/auth.md"]);

function pageBehindMarkdownSuffix(path: string): string | undefined {
	if (!path.endsWith(".md") || MARKDOWN_DOCUMENTS.has(path)) return undefined;
	const page = path.slice(0, -".md".length);
	return page === "/index" ? "/" : page;
}

async function convertToMarkdown(response: Response, pageUrl: string): Promise<Response> {
	if (!response.ok || !(response.headers.get("Content-Type") ?? "").startsWith("text/html")) return response;

	const markdown = htmlToMarkdown(await response.text(), pageUrl);
	const headers = new Headers(response.headers);
	headers.set("Content-Type", "text/markdown; charset=utf-8");
	headers.delete("Content-Length");
	if (markdown) headers.set("x-markdown-tokens", String(estimateTokens(markdown)));

	return new Response(markdown, { status: response.status, headers });
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

		// Pages outside the MDX sources have no markdown twin to route to, so the
		// rendered HTML is converted on the way out instead.
		const readable = request.method === "GET" || request.method === "HEAD";
		const convertFrom =
			target || negotiable || !readable
				? undefined
				: (pageBehindMarkdownSuffix(path) ?? (wantsMarkdown ? path : undefined));

		let req = request;
		if (target) {
			url.pathname = target;
			req = new Request(url, request);
		} else if (convertFrom) {
			url.pathname = convertFrom;
			req = withAcceptHtml(request, url);
		}

		let response = await handler.fetch(req);
		if (convertFrom) response = await convertToMarkdown(response, request.url);

		addAgentHeaders(response, path);
		return addSecurityHeaders(response);
	},
});
