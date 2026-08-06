import { afterEach, describe, expect, it, vi } from "vitest";

const scraperClient = vi.hoisted(() => ({
	chatGptLlmScraperLiveAdvanced: vi.fn(),
	geminiLlmScraperLiveAdvanced: vi.fn(),
}));

vi.mock("dataforseo-client", () => ({
	AiOptimizationApi: class {
		chatGptLlmScraperLiveAdvanced = scraperClient.chatGptLlmScraperLiveAdvanced;
		geminiLlmScraperLiveAdvanced = scraperClient.geminiLlmScraperLiveAdvanced;
	},
	AiOptimizationChatGptLlmScraperLiveAdvancedRequestInfo: class {
		constructor(args: Record<string, unknown>) {
			Object.assign(this, args);
		}
	},
	AiOptimizationGeminiLlmScraperLiveAdvancedRequestInfo: class {
		constructor(args: Record<string, unknown>) {
			Object.assign(this, args);
		}
	},
}));

import { dataforseoScraper } from "./dataforseo-scraper";

afterEach(() => {
	vi.clearAllMocks();
});

function scraperResponse(result: Record<string, unknown>) {
	return { tasks: [{ status_code: 20000, status_message: "Ok.", result: [result] }] };
}

describe("dataforseo-scraper provider", () => {
	it("only supports the two models DataForSEO has a scraper for", () => {
		expect(
			dataforseoScraper.validateTarget?.({ model: "chatgpt", provider: "dataforseo-scraper", webSearch: true }),
		).toBe(null);
		expect(
			dataforseoScraper.validateTarget?.({ model: "gemini", provider: "dataforseo-scraper", webSearch: true }),
		).toBe(null);
		// DataForSEO exposes no Perplexity scraper endpoint.
		expect(
			dataforseoScraper.validateTarget?.({ model: "perplexity", provider: "dataforseo-scraper", webSearch: true }),
		).toMatch(/only supports/);
	});

	it("rejects a version slug rather than silently ignoring it", () => {
		expect(
			dataforseoScraper.validateTarget?.({
				model: "chatgpt",
				provider: "dataforseo-scraper",
				version: "gpt-4.1",
				webSearch: true,
			}),
		).toMatch(/does not accept a version slug/);
	});

	it("requires :online because the scraped surfaces always search", () => {
		expect(
			dataforseoScraper.validateTarget?.({ model: "chatgpt", provider: "dataforseo-scraper", webSearch: false }),
		).toMatch(/requires :online/);
	});

	it("rejects prompts longer than DataForSEO's 500 character limit before calling the API", async () => {
		await expect(dataforseoScraper.run("chatgpt", "x".repeat(501), { webSearch: true })).rejects.toThrow(
			/DataForSEO prompts must be 500 characters or fewer/,
		);
		expect(scraperClient.chatGptLlmScraperLiveAdvanced).not.toHaveBeenCalled();
	});

	it("forces web search for ChatGPT and returns its markdown, sources and fan-out queries", async () => {
		scraperClient.chatGptLlmScraperLiveAdvanced.mockResolvedValueOnce(
			scraperResponse({
				model: "gpt-5-5",
				markdown: "The JBL Xtreme 5 launched last month and reviewed well.",
				fan_out_queries: ["best speakers released July 2026"],
				sources: [{ url: "https://www.techradar.com/audio/jbl-xtreme-5", title: "JBL Xtreme 5 review" }],
				// Results the model was shown, not sources it cited — must not become citations.
				search_results: [{ url: "https://example.com/not-cited", title: "Not cited" }],
			}),
		);

		const result = await dataforseoScraper.run("chatgpt", "What speaker released last month reviews well?", {
			webSearch: true,
		});

		const [payload] = scraperClient.chatGptLlmScraperLiveAdvanced.mock.calls[0];
		expect(payload[0]).toMatchObject({
			keyword: "What speaker released last month reviews well?",
			location_code: 2840,
			force_web_search: true,
		});

		expect(result.textContent).toContain("JBL Xtreme 5");
		expect(result.webQueries).toEqual(["best speakers released July 2026"]);
		expect(result.citations).toHaveLength(1);
		expect(result.citations[0].domain).toBe("techradar.com");
		expect(result.modelVersion).toBe("gpt-5-5");
	});

	it("falls back to the unavailable marker for Gemini, which reports no fan-out queries", async () => {
		const url = "https://www.whathifi.com/reviews/sonos-era-300";
		scraperClient.geminiLlmScraperLiveAdvanced.mockResolvedValueOnce(
			scraperResponse({
				model: "3.5 Flash-Lite",
				markdown: "The Sonos Era 300 is a strong recent release.",
				sources: [{ url, title: "Sonos Era 300 review" }],
				// items repeat the same sources; citations must stay deduplicated.
				items: [{ type: "gemini_text", sources: [{ url, title: "Sonos Era 300 review" }] }],
			}),
		);

		const result = await dataforseoScraper.run("gemini", "What speaker released last month reviews well?", {
			webSearch: true,
		});

		expect(result.textContent).toContain("Sonos Era 300");
		expect(result.webQueries).toEqual(["unavailable"]);
		expect(result.citations).toHaveLength(1);
		expect(result.citations[0].domain).toBe("whathifi.com");
	});

	it("surfaces a failed DataForSEO task as an error", async () => {
		scraperClient.chatGptLlmScraperLiveAdvanced.mockResolvedValueOnce({
			tasks: [{ status_code: 40602, status_message: "Internal SE Server Error.", result: null }],
		});

		await expect(dataforseoScraper.run("chatgpt", "What speaker reviews well?", { webSearch: true })).rejects.toThrow(
			"DataForSEO API Error: 40602 Internal SE Server Error.",
		);
	});
});
