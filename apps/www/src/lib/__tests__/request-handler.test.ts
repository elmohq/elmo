import { describe, expect, it, vi } from "vitest";
import { markdownNotFound } from "@/lib/get-llm-text";
import { llmsTxt } from "@/lib/llms-txt";
import { createRequestHandler } from "@/lib/request-handler";

const HTML = "<!doctype html><html><body>page</body></html>";

/** Stands in for the Start router: known pages render HTML, the markdown
 * routes answer markdown, anything else is the HTML not-found page. */
function fakeApp() {
	const seen: Request[] = [];
	const upstream = vi.fn(async (request: Request) => {
		seen.push(request);
		const { pathname } = new URL(request.url);
		if (pathname === "/llms.mdx/docs/getting-started") {
			return new Response("# Quick Start", { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
		}
		if (pathname.startsWith("/llms.mdx/")) return markdownNotFound();
		if (pathname === "/blog/rss.xml") {
			return new Response("<rss/>", { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
		}
		const known = ["/", "/pricing", "/docs/getting-started"].includes(pathname);
		return new Response(HTML, {
			status: known ? 200 : 404,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	});
	return { handle: createRequestHandler(upstream), seen, upstream };
}

function get(path: string, accept?: string, method = "GET") {
	return new Request(`https://www.elmohq.com${path}`, {
		method,
		headers: accept === undefined ? {} : { Accept: accept },
	});
}

const CHROME_ACCEPT =
	"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";

describe("homepage content negotiation", () => {
	it("serves the site overview as markdown to an agent that asks for it", async () => {
		const { handle, upstream } = fakeApp();
		const response = await handle(get("/", "text/markdown"));

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
		expect(response.headers.get("Vary")).toBe("Accept");
		expect(await response.text()).toBe(llmsTxt);
		expect(upstream).not.toHaveBeenCalled();
	});

	it("serves HTML, still varying on Accept, to a browser", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/", CHROME_ACCEPT));

		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
		expect(response.headers.get("Vary")).toBe("Accept");
		expect(await response.text()).toBe(HTML);
	});

	it.each([
		["text/markdown", "markdown"],
		["text/markdown, text/html;q=0.8", "markdown"],
		["text/html", "html"],
		["text/markdown;q=0, text/html", "html"],
		["text/html;q=0.5, text/markdown;q=0.9", "markdown"],
		["text/x-markdown", "markdown"],
		["text/html;level=1;q=0, text/html", "html"],
		["*/*", "html"],
		[undefined, "html"],
	])("Accept %s gets %s", async (accept, expected) => {
		const { handle } = fakeApp();
		const response = await handle(get("/", accept));
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			expected === "markdown" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8",
		);
	});

	it("answers HEAD with the markdown headers and no body", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/", "text/markdown", "HEAD"));
		expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
		expect(await response.text()).toBe("");
	});

	it.each(["application/pdf", "text/markdown;q=0, text/html;q=0", "image/*"])(
		"refuses Accept %s with 406 listing what it can serve",
		async (accept) => {
			const { handle, upstream } = fakeApp();
			const response = await handle(get("/", accept));

			expect(response.status).toBe(406);
			expect(response.headers.get("Vary")).toBe("Accept");
			const body = await response.text();
			expect(body).toContain("text/html");
			expect(body).toContain("text/markdown");
			expect(upstream).not.toHaveBeenCalled();
		},
	);

	it("does not 406 a type that a more specific range rescues", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/", "text/*;q=0, text/html"));
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
	});
});

describe("docs content negotiation", () => {
	it("serves a docs page as markdown at its own URL", async () => {
		const { handle, seen } = fakeApp();
		const response = await handle(get("/docs/getting-started", "text/markdown"));

		expect(await response.text()).toBe("# Quick Start");
		expect(response.headers.get("Vary")).toBe("Accept");
		expect(new URL(seen[0].url).pathname).toBe("/llms.mdx/docs/getting-started");
	});

	it("accepts the legacy text/x-markdown type", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/docs/getting-started", "text/x-markdown"));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("# Quick Start");
	});

	it.each(["application/rss+xml, application/atom+xml", "text/markdown"])(
		"serves the RSS feed to Accept %s untouched",
		async (accept) => {
			const { handle } = fakeApp();
			const response = await handle(get("/blog/rss.xml", accept));
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
			expect(await response.text()).toBe("<rss/>");
		},
	);

	it("leaves pages without a markdown variant as HTML", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/pricing", "text/markdown"));
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
	});
});

describe("not-found pages", () => {
	it.each(["/__probe-does-not-exist", "/docs/does-not-exist", "/docs/does-not-exist.md"])(
		"answers %s with a markdown 404 that points agents somewhere useful",
		async (path) => {
			const { handle } = fakeApp();
			const response = await handle(get(path, "text/markdown"));

			expect(response.status).toBe(404);
			expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
			const body = await response.text();
			expect(body).toMatch(/^# Page not found/);
			expect(body).toContain("https://www.elmohq.com/llms.txt");
			expect(body).toContain("https://www.elmohq.com/sitemap.xml");
		},
	);

	it("keeps the HTML 404 for browsers, varying on Accept", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/__probe-does-not-exist", CHROME_ACCEPT));

		expect(response.status).toBe(404);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
		expect(response.headers.get("Vary")).toBe("Accept");
		expect(await response.text()).toBe(HTML);
	});
});

describe("redirects", () => {
	it("still redirects permanently regardless of Accept", async () => {
		const { handle } = fakeApp();
		const response = await handle(get("/terms", "text/markdown"));
		expect(response.status).toBe(308);
		expect(response.headers.get("Location")).toBe("/legal/terms");
	});
});
