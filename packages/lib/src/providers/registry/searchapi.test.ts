import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchapi } from "./searchapi";

// A ChatGPT answer with web search on: the cited pages in `reference_links`,
// the full retrieved set in `web_results` (not citations), and the verbatim
// `search_queries` ChatGPT ran.
const CHATGPT_RESPONSE = {
	markdown: "The **Marshall Stockwell III** is a well-reviewed portable speaker.",
	text_blocks: [{ type: "paragraph", answer: "The Marshall Stockwell III is a well-reviewed portable speaker." }],
	reference_links: [
		{
			index: 0,
			title: "Marshall Stockwell III review",
			link: "https://www.techradar.com/stockwell-iii",
			source: "TechRadar",
		},
	],
	web_results: [
		{ position: 1, title: "Speaker roundup", link: "https://www.whathifi.com/roundup", source: "What Hi-Fi" },
	],
	search_queries: ["best speakers released August 2026"],
	response_metadata: { model: "gpt-5-6", is_web_search_performed: true },
};

// The Google SERP that carries an AI Overview, alongside the organic results and
// pagination that make the page an order of magnitude bigger than the overview.
const AI_OVERVIEW_SERP = {
	search_metadata: { id: "search_1", status: "Success" },
	search_parameters: { engine: "google", q: "best running shoes for beginners" },
	ai_overview: {
		markdown: "The **Brooks Ghost** and **Nike Pegasus** are strong beginner picks.",
		reference_links: [
			{
				index: 0,
				title: "Best beginner shoes",
				link: "https://www.runnersworld.com/beginner-shoes",
				source: "Runner's World",
			},
			// A redirect SearchApi could not resolve back to its publisher.
			{ index: 1, title: "Shoe guide", link: "https://www.google.com/goto?url=CAESfAHrOzAV7Y5Bq0cBdDMz" },
		],
	},
	organic_results: [{ position: 1, title: "Beginner shoe guide", link: "https://example.com/guide" }],
	pagination: { current: 1 },
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>, call = 0): URL {
	return new URL(fetchMock.mock.calls[call][0]);
}

beforeEach(() => {
	vi.stubEnv("SEARCHAPI_API_KEY", "test-key");
});

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("searchapi provider", () => {
	it("returns the answer, its cited pages, and the queries it ran", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(CHATGPT_RESPONSE));
		vi.stubGlobal("fetch", fetchMock);

		const result = await searchapi.run("chatgpt", "What is a well-reviewed speaker?", { webSearch: true });

		const url = requestedUrl(fetchMock);
		expect(url.origin + url.pathname).toBe("https://www.searchapi.io/api/v1/search");
		expect(url.searchParams.get("engine")).toBe("chatgpt");
		expect(url.searchParams.get("q")).toBe("What is a well-reviewed speaker?");
		expect(url.searchParams.get("web_search")).toBe("true");
		expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");

		expect(result.textContent).toContain("Marshall Stockwell III");
		expect(result.webQueries).toEqual(["best speakers released August 2026"]);
		expect(result.modelVersion).toBe("gpt-5-6");
		// `web_results` is what ChatGPT retrieved, not what it cited.
		expect(result.citations.map((c) => c.url)).toEqual(["https://www.techradar.com/stockwell-iii"]);
		expect(result.citations[0]).toMatchObject({ domain: "techradar.com", title: "Marshall Stockwell III review" });
	});

	it("leaves ChatGPT's web search off unless the target asks for it", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				markdown: "A speaker answered from memory, with no sources.",
				response_metadata: { model: "gpt-5-6", is_web_search_performed: false },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const result = await searchapi.run("chatgpt", "What is a well-reviewed speaker?", { webSearch: false });

		expect(requestedUrl(fetchMock).searchParams.has("web_search")).toBe(false);
		expect(result.webQueries).toEqual([]);
	});

	it("keeps the queries when ChatGPT searches on its own initiative", async () => {
		// ChatGPT may search whether or not it was asked to, and the response says
		// which happened — dropping the queries would understate the fan-out.
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(CHATGPT_RESPONSE)));

		const result = await searchapi.run("chatgpt", "What is a well-reviewed speaker?", { webSearch: false });

		expect(result.webQueries).toEqual(["best speakers released August 2026"]);
	});

	it("reads Google AI Overview off the result page and stores only the overview", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(AI_OVERVIEW_SERP));
		vi.stubGlobal("fetch", fetchMock);

		const result = await searchapi.run("google-ai-overview", "best running shoes for beginners", { webSearch: true });

		expect(requestedUrl(fetchMock).searchParams.get("engine")).toBe("google");
		expect(requestedUrl(fetchMock).searchParams.get("link")).toBe("resolved");

		expect(result.textContent).toContain("Brooks Ghost");
		expect(Object.keys(result.rawOutput as object)).not.toContain("organic_results");
		expect((result.rawOutput as any).ai_overview.markdown).toContain("Brooks Ghost");
		// Google searched, but the overview never reports the queries behind it.
		expect(result.webQueries).toEqual(["unavailable"]);
	});

	it("reports a source Google served as a redirect it could not resolve", async () => {
		// Like the Google Shopping links the other scrapers report, the wrapper is
		// stored as the provider gave it and excluded from the reports by URL.
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(AI_OVERVIEW_SERP)));

		const result = await searchapi.run("google-ai-overview", "best running shoes for beginners", { webSearch: true });

		expect(result.citations.map((c) => c.domain)).toEqual(["runnersworld.com", "google.com"]);
	});

	it("fails a query Google answered without an AI Overview", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(jsonResponse({ organic_results: [], pagination: { current: 1 } })),
		);

		await expect(searchapi.run("google-ai-overview", "sonos era 300", { webSearch: true })).rejects.toThrow(
			/no AI Overview/i,
		);
	});

	it("fails a Perplexity run that came back as the sign-up wall", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					markdown: "Sign up and repeat your request.",
					text_blocks: [{ type: "paragraph", answer: "Sign up and repeat your request." }],
					response_metadata: { model: "turbo" },
				}),
			),
		);

		await expect(searchapi.run("perplexity", "What is a well-reviewed speaker?", { webSearch: true })).rejects.toThrow(
			/sign-up wall/i,
		);
	});

	it("retries a rate-limited request and keeps the answer that follows", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ error: "Too many requests" }, 429))
			.mockResolvedValueOnce(jsonResponse(CHATGPT_RESPONSE));
		vi.stubGlobal("fetch", fetchMock);

		const promise = searchapi.run("chatgpt", "What is a well-reviewed speaker?", { webSearch: true });
		await vi.runAllTimersAsync();

		await expect(promise).resolves.toMatchObject({ modelVersion: "gpt-5-6" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("gives up immediately on a rejected key rather than spending more requests", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid API key." }, 401));
		vi.stubGlobal("fetch", fetchMock);

		await expect(searchapi.run("chatgpt", "What is a well-reviewed speaker?", { webSearch: true })).rejects.toThrow(
			/401/,
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
