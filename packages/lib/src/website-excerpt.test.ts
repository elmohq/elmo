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
 * `direct` covers the tier-2 backend fetch (any non-Jina URL).
 */
function stubFetch(tiers: { jina?: FakeResponse; direct?: FakeResponse }) {
	const fetchMock = vi.fn(async (input: unknown) => {
		const url = String(input);
		if (url.startsWith("https://r.jina.ai/")) {
			if (!tiers.jina) throw new Error("unexpected jina call");
			return tiers.jina;
		}
		if (!tiers.direct) throw new Error("unexpected direct call");
		return tiers.direct;
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function headersOf(call: unknown[]): Record<string, string> {
	return (call[1] as { headers: Record<string, string> }).headers;
}

// A real article so tier 2 exercises linkedom + Readability for real.
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
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe("getWebsiteExcerpt", () => {
	it("returns Jina content and skips the fallback when Jina succeeds", async () => {
		const fetchMock = stubFetch({
			jina: response({ contentType: "text/plain", body: "# Acme\nFrom Jina reader" }),
		});

		const excerpt = await getWebsiteExcerpt("acme.com");

		expect(excerpt).toContain("From Jina reader");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0][0])).toBe("https://r.jina.ai/https://acme.com");
	});

	it("sends an Authorization header to Jina when JINA_API_KEY is set", async () => {
		vi.stubEnv("JINA_API_KEY", "jina_test_key");
		const fetchMock = stubFetch({ jina: response({ body: "content" }) });

		await getWebsiteExcerpt("acme.com");

		expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBe("Bearer jina_test_key");
	});

	it("sends no Authorization header when JINA_API_KEY is unset", async () => {
		vi.stubEnv("JINA_API_KEY", "");
		const fetchMock = stubFetch({ jina: response({ body: "content" }) });

		await getWebsiteExcerpt("acme.com");

		expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBeUndefined();
	});

	it("falls back to backend fetch + Readability when Jina is blocked (401)", async () => {
		const fetchMock = stubFetch({
			jina: response({ ok: false, status: 401 }),
			direct: response({ contentType: "text/html; charset=utf-8", body: ARTICLE_HTML }),
		});

		const excerpt = await getWebsiteExcerpt("acme.com");

		expect(excerpt).toContain("autonomous mobile robots");
		// Readability strips chrome like the nav and returns clean text (no HTML tags).
		expect(excerpt).not.toContain("Careers");
		expect(excerpt).not.toContain("<p>");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("continues past Jina when it throws (network error)", async () => {
		const fetchMock = vi.fn(async (input: unknown) => {
			const url = String(input);
			if (url.startsWith("https://r.jina.ai/")) throw new Error("network down");
			return response({ contentType: "text/html", body: ARTICLE_HTML }) as unknown;
		});
		vi.stubGlobal("fetch", fetchMock);

		expect(await getWebsiteExcerpt("acme.com")).toContain("autonomous mobile robots");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("returns an empty string when both tiers fail", async () => {
		stubFetch({
			jina: response({ ok: false, status: 401 }),
			direct: response({ ok: false, status: 500 }),
		});

		expect(await getWebsiteExcerpt("acme.com")).toBe("");
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
