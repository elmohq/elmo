import { describe, expect, it } from "vitest";
import { markdownNotFound } from "@/lib/get-llm-text";
import { llmsTxt } from "@/lib/llms-txt";
import { createRequestHandler } from "@/lib/request-handler";

const MARKDOWN = "text/markdown; charset=utf-8";
const HTML_TYPE = "text/html; charset=utf-8";

function page(title: string) {
	return `<!doctype html><html><head><title>${title}</title></head><body><nav>Menu</nav><main><h1>${title}</h1><a href="/docs">Docs</a></main></body></html>`;
}

/** Stands in for the Start router: known pages render HTML, the markdown
 * routes answer markdown, anything else is the HTML not-found page. */
function fakeApp() {
	const seen: Request[] = [];
	const handle = createRequestHandler(async (request) => {
		seen.push(request);
		const { pathname } = new URL(request.url);
		if (pathname === "/llms.mdx/docs/getting-started") {
			return new Response("# Quick Start", { headers: { "Content-Type": MARKDOWN } });
		}
		if (pathname.startsWith("/llms.mdx/")) return markdownNotFound();
		if (pathname === "/auth.md") return new Response("# auth.md", { headers: { "Content-Type": MARKDOWN } });
		if (pathname === "/blog/rss.xml") {
			return new Response("<rss/>", { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
		}
		const titles: Record<string, string> = { "/": "Home", "/pricing": "Pricing", "/docs/getting-started": "Docs" };
		const title = titles[pathname];
		return new Response(page(title ?? "Not Found"), {
			status: title ? 200 : 404,
			headers: { "Content-Type": HTML_TYPE },
		});
	});
	return { handle, seen };
}

function get(path: string, accept?: string, method = "GET") {
	return new Request(`https://www.elmohq.com${path}`, {
		method,
		headers: accept === undefined ? {} : { Accept: accept },
	});
}

const CHROME_ACCEPT =
	"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";

describe("markdown for pages without an MDX source", () => {
	it("converts the rendered page for an agent that asks for markdown", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/pricing", "text/markdown"));

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(MARKDOWN);
		expect(response.headers.get("Vary")).toBe("Accept");
		expect(await response.text()).toBe("# Pricing\n\n[Docs](https://www.elmohq.com/docs)");
	});

	it("serves the same markdown under a .md suffix, ignoring Accept", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/pricing.md", CHROME_ACCEPT));
		expect(response.headers.get("Content-Type")).toBe(MARKDOWN);
		expect(await response.text()).toMatch(/^# Pricing/);
	});

	it.each([
		["/", "text/markdown"],
		["/index.md", CHROME_ACCEPT],
	])("answers %s (Accept %s) with the site overview", async (path, accept) => {
		const { handle, seen } = fakeApp();
		const response = await handle(get(path, accept));

		expect(response.headers.get("Content-Type")).toBe(MARKDOWN);
		expect(await response.text()).toBe(llmsTxt);
		expect(seen.every((request) => new URL(request.url).pathname !== "/")).toBe(true);
	});

	it("serves HTML, still varying on Accept, to a browser", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/", CHROME_ACCEPT));

		expect(response.headers.get("Content-Type")).toBe(HTML_TYPE);
		expect(response.headers.get("Vary")).toBe("Accept");
		expect(response.headers.get("Link")).toContain(`</index.md>; rel="alternate"; type="text/markdown"`);
	});

	it.each([
		["text/markdown", MARKDOWN],
		["text/x-markdown", MARKDOWN],
		["text/markdown, text/html;q=0.8", MARKDOWN],
		["text/html;q=0.5, text/markdown;q=0.9", MARKDOWN],
		["text/html", HTML_TYPE],
		["*/*", HTML_TYPE],
		[undefined, HTML_TYPE],
	])("Accept %s gets %s", async (accept, type) => {
		const { handle } = fakeApp();
		const response = await handle(get("/", accept));
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(type);
	});

	it("answers HEAD with the markdown headers and no body", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/", "text/markdown", "HEAD"));
		expect(response.headers.get("Content-Type")).toBe(MARKDOWN);
		expect(await response.text()).toBe("");
	});

	it("leaves markdown documents that are routes of their own alone", async () => {
		const { handle } = fakeApp();
		expect(await (await handle(get("/auth.md"))).text()).toBe("# auth.md");
	});
});

describe("docs and blog", () => {
	it("serves a docs page's MDX source at its own URL", async () => {
		const { handle, seen } = fakeApp();
		const response = await handle(get("/docs/getting-started", "text/markdown"));

		expect(await response.text()).toBe("# Quick Start");
		expect(response.headers.get("Vary")).toBe("Accept");
		expect(new URL(seen[0].url).pathname).toBe("/llms.mdx/docs/getting-started");
	});

	it.each(["application/rss+xml, application/atom+xml", "text/markdown"])(
		"serves the RSS feed to Accept %s untouched",
		async (accept) => {
			const { handle } = fakeApp();
			const response = await handle(get("/blog/rss.xml", accept));
			expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
			expect(await response.text()).toBe("<rss/>");
		},
	);
});

describe("not-found pages", () => {
	it.each([
		["/does-not-exist", "text/markdown"],
		["/does-not-exist.md", CHROME_ACCEPT],
		["/docs/does-not-exist", "text/markdown"],
		["/docs/does-not-exist.md", CHROME_ACCEPT],
	])("answers %s (Accept %s) with a markdown 404 that points agents somewhere useful", async (path, accept) => {
		const { handle } = fakeApp();
		const response = await handle(get(path, accept));

		expect(response.status).toBe(404);
		expect(response.headers.get("Content-Type")).toBe(MARKDOWN);
		const body = await response.text();
		expect(body).toMatch(/^# Page not found/);
		expect(body).toContain("https://www.elmohq.com/llms.txt");
	});

	it("keeps the HTML 404 for browsers, varying on Accept, with no markdown alternate", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/does-not-exist", CHROME_ACCEPT));

		expect(response.status).toBe(404);
		expect(response.headers.get("Content-Type")).toBe(HTML_TYPE);
		expect(response.headers.get("Vary")).toBe("Accept");
		expect(response.headers.get("Link")).not.toContain("text/markdown");
	});
});

describe("redirects", () => {
	it("still redirects permanently regardless of Accept", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/terms", "text/markdown"));
		expect(response.status).toBe(308);
		expect(response.headers.get("Location")).toBe("/legal/terms");
	});

	it("points OAuth discovery at the app, which is the issuer", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/.well-known/oauth-authorization-server"));
		expect(response.status).toBe(307);
		expect(response.headers.get("Location")).toBe("https://app.elmohq.com/.well-known/oauth-authorization-server");
	});
});
