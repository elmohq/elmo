import { afterEach, describe, expect, it, vi } from "vitest";
import { getWebsiteExcerpt } from "./website-excerpt";

type FakeResponse = {
	ok: boolean;
	status: number;
	headers: { get: (key: string) => string | null };
	text: () => Promise<string>;
};

function response(opts: { ok?: boolean; status?: number; contentType?: string; body?: string }): FakeResponse {
	const { ok = true, status = 200, contentType = "text/plain", body = "" } = opts;
	return {
		ok,
		status,
		headers: { get: (key) => (key.toLowerCase() === "content-type" ? contentType : null) },
		text: async () => body,
	};
}

/**
 * Route a stubbed fetch to a per-tier response based on the request URL.
 * `direct` covers the tier-3 backend fetch (any non-reader URL).
 */
function stubFetch(tiers: { jina?: FakeResponse; microlink?: FakeResponse; direct?: FakeResponse }) {
	const fetchMock = vi.fn(async (input: unknown) => {
		const url = String(input);
		if (url.startsWith("https://r.jina.ai/")) {
			if (!tiers.jina) throw new Error("unexpected jina call");
			return tiers.jina;
		}
		if (url.startsWith("https://api.microlink.io/")) {
			if (!tiers.microlink) throw new Error("unexpected microlink call");
			return tiers.microlink;
		}
		if (!tiers.direct) throw new Error("unexpected direct call");
		return tiers.direct;
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

// A real article so tier 3 exercises linkedom + Readability for real.
const ARTICLE_HTML = `<!DOCTYPE html>
<html><head><title>Acme Robotics</title></head>
<body>
	<nav>Home About Careers Contact</nav>
	<article>
		<h1>Acme Robotics builds warehouse automation</h1>
		<p>Acme Robotics designs autonomous mobile robots that move inventory through
		fulfillment centers, replacing fixed conveyor systems with fleets that route
		themselves around obstacles. The company sells to mid-market retailers who need
		to scale peak-season throughput without rebuilding their warehouses, and its
		software coordinates hundreds of robots from a single control plane.</p>
		<p>Founded in 2019, Acme now operates in twelve distribution centers across
		North America and reports that its robots cut order-picking time roughly in half.</p>
	</article>
	<footer>Copyright Acme Robotics</footer>
</body></html>`;

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("getWebsiteExcerpt", () => {
	it("returns Jina content and skips later tiers when Jina succeeds", async () => {
		const fetchMock = stubFetch({
			jina: response({ contentType: "text/plain", body: "# Acme\nFrom Jina reader" }),
		});

		const excerpt = await getWebsiteExcerpt("acme.com");

		expect(excerpt).toContain("From Jina reader");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0][0])).toBe("https://r.jina.ai/https://acme.com");
	});

	it("falls back to Microlink when Jina is blocked (401)", async () => {
		const fetchMock = stubFetch({
			jina: response({ ok: false, status: 401 }),
			microlink: response({ contentType: "text/markdown", body: "# Acme\nFrom Microlink" }),
		});

		const excerpt = await getWebsiteExcerpt("https://acme.com");

		expect(excerpt).toContain("From Microlink");
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const microlinkUrl = String(fetchMock.mock.calls[1][0]);
		expect(microlinkUrl).toContain("api.microlink.io");
		expect(microlinkUrl).toContain("embed=markdown");
		expect(microlinkUrl).toContain(encodeURIComponent("https://acme.com"));
	});

	it("falls back to backend fetch + Readability when both readers fail", async () => {
		const fetchMock = stubFetch({
			jina: response({ ok: false, status: 401 }),
			microlink: response({ ok: false, status: 429 }),
			direct: response({ contentType: "text/html; charset=utf-8", body: ARTICLE_HTML }),
		});

		const excerpt = await getWebsiteExcerpt("acme.com");

		expect(excerpt).toContain("autonomous mobile robots");
		// Readability strips chrome like the nav and returns clean text (no HTML tags).
		expect(excerpt).not.toContain("Careers");
		expect(excerpt).not.toContain("<p>");
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("treats a Microlink JSON error envelope as a miss and falls through", async () => {
		const fetchMock = stubFetch({
			jina: response({ ok: false, status: 401 }),
			// 200 OK but application/json => Microlink error envelope, not markdown.
			microlink: response({ contentType: "application/json", body: '{"status":"fail"}' }),
			direct: response({ contentType: "text/html", body: ARTICLE_HTML }),
		});

		const excerpt = await getWebsiteExcerpt("acme.com");

		expect(excerpt).toContain("autonomous mobile robots");
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("returns an empty string when every tier fails", async () => {
		stubFetch({
			jina: response({ ok: false, status: 401 }),
			microlink: response({ ok: false, status: 429 }),
			direct: response({ ok: false, status: 500 }),
		});

		expect(await getWebsiteExcerpt("acme.com")).toBe("");
	});

	it("continues past a tier that throws (network error)", async () => {
		const fetchMock = vi.fn(async (input: unknown) => {
			const url = String(input);
			if (url.startsWith("https://r.jina.ai/")) throw new Error("network down");
			return response({ contentType: "text/markdown", body: "From Microlink" }) as unknown;
		});
		vi.stubGlobal("fetch", fetchMock);

		expect(await getWebsiteExcerpt("acme.com")).toContain("From Microlink");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("caps the excerpt at 200 lines", async () => {
		const body = Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n");
		stubFetch({ jina: response({ body }) });

		const excerpt = await getWebsiteExcerpt("acme.com");

		expect(excerpt.split("\n")).toHaveLength(200);
		expect(excerpt).toContain("line 199");
		expect(excerpt).not.toContain("line 200");
	});

	it("returns an empty string for an empty URL without fetching", async () => {
		const fetchMock = stubFetch({});
		expect(await getWebsiteExcerpt("")).toBe("");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
