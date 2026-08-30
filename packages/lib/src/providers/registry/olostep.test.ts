import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
	batchesCreate: vi.fn(),
	retrieve: vi.fn(),
}));

vi.mock("olostep", () => ({
	default: class {
		batches = { create: sdk.batchesCreate };
		retrieve = sdk.retrieve;
	},
}));

import { olostep } from "./olostep";

/**
 * Olostep answers a batch, then the payload is fetched separately, so a run is
 * only reachable through both calls. `json_content` arrives as a JSON string
 * from the real API unless a test says otherwise.
 */
function stubRun(payload: unknown, { asString = true }: { asString?: boolean } = {}) {
	sdk.batchesCreate.mockResolvedValue({
		waitTillDone: vi.fn().mockResolvedValue(undefined),
		items: async function* () {
			yield { retrieve_id: "retrieve-1" };
		},
	});
	sdk.retrieve.mockResolvedValue({
		json_content: asString ? JSON.stringify(payload) : payload,
	});
}

beforeEach(() => {
	vi.stubEnv("OLOSTEP_API_KEY", "test-key");
});

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllEnvs();
});

describe("olostep run", () => {
	it("scrapes the model's own surface and returns the parsed answer", async () => {
		stubRun({
			result: { markdown_content: "The **Sonos Era 300** is well reviewed." },
			model: "gpt-5-3-mini",
			search_queries: ["best speakers 2026"],
			sources: [{ url: "https://www.whathifi.com/sonos-era-300", title: "Sonos Era 300 review" }],
		});

		const result = await olostep.run("chatgpt", "What is a well-reviewed speaker?");

		expect(sdk.batchesCreate).toHaveBeenCalledWith(
			[{ url: "https://chatgpt.com/?q=What%20is%20a%20well-reviewed%20speaker%3F", customId: "1" }],
			{ parser: { id: "@olostep/chatgpt-results" } },
		);
		expect(result.textContent).toBe("The **Sonos Era 300** is well reviewed.");
		expect(result.modelVersion).toBe("gpt-5-3-mini");
		expect(result.webQueries).toEqual(["best speakers 2026"]);
		expect(result.citations).toEqual([
			{
				url: "https://www.whathifi.com/sonos-era-300",
				title: "Sonos Era 300 review",
				domain: "whathifi.com",
				citationIndex: 0,
			},
		]);
	});

	it("sends each model to its own parser and URL", async () => {
		stubRun({ answer: "AI Mode answer" });

		await olostep.run("google-ai-mode", "best running shoes");

		expect(sdk.batchesCreate).toHaveBeenCalledWith(
			[{ url: expect.stringContaining("google.com/aimode"), customId: "1" }],
			{
				parser: { id: "@olostep/google-aimode-results" },
			},
		);
	});

	// The payload is stored so a row can be re-read later; queries reported from
	// anywhere else would not survive that round trip.
	it("stores the payload the reported queries came from", async () => {
		const payload = {
			answer: "answer",
			search_queries: ["best speakers 2026"],
			sources: [{ url: "https://example.com/a" }],
		};
		stubRun(payload);

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.rawOutput).toEqual(payload);
		for (const query of result.webQueries) {
			expect(JSON.stringify(result.rawOutput)).toContain(query);
		}
	});

	it("reads the payload when it arrives already parsed rather than as a string", async () => {
		stubRun({ answer: "answer", search_queries: ["a query"] }, { asString: false });

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.textContent).toBe("answer");
		expect(result.webQueries).toEqual(["a query"]);
	});

	it("fails loudly when the batch finishes with nothing in it", async () => {
		sdk.batchesCreate.mockResolvedValue({
			waitTillDone: vi.fn().mockResolvedValue(undefined),
			items: async function* () {},
		});

		await expect(olostep.run("chatgpt", "prompt")).rejects.toThrow("no items returned");
	});
});

describe("olostep web queries", () => {
	it.each([
		["a flat list", { search_queries: ["one", "two"] }],
		["objects carrying the query", { network_search_calls: { search_queries: [{ query: "one" }, { query: "two" }] } }],
		["bare strings under the model's own key", { search_model_queries: ["one", "two"] }],
	])("reads the searches from %s", async (_label, shape) => {
		stubRun({ answer: "answer", ...shape });

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.webQueries).toEqual(["one", "two"]);
	});

	it("drops blank entries rather than reporting them as searches", async () => {
		stubRun({ answer: "answer", search_queries: ["real query", "", "   "] });

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.webQueries).toEqual(["real query"]);
	});

	// The sentinel is the claim "a search happened but the strings weren't
	// exposed", so citations are what license it.
	it("marks queries unavailable when only citations prove a search ran", async () => {
		stubRun({ answer: "answer", sources: [{ url: "https://example.com/a" }] });

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.webQueries).toEqual(["unavailable"]);
	});

	it("reports no queries at all when nothing suggests a search ran", async () => {
		stubRun({ answer: "answer" });

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.webQueries).toEqual([]);
	});
});

describe("olostep answer and citation shapes", () => {
	it.each([
		["result.markdown_content", { result: { markdown_content: "answer" } }],
		["answer_markdown", { answer_markdown: "answer" }],
		["result.text_content", { result: { text_content: "answer" } }],
		["a plain answer string", { answer: "answer" }],
	])("reads the answer from %s", async (_label, shape) => {
		stubRun(shape);

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.textContent).toBe("answer");
	});

	it("says so rather than returning an empty answer when the payload has none", async () => {
		stubRun({ unexpected: true });

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.textContent).toContain("No text content found");
	});

	it.each([
		["sources", { sources: [{ url: "https://www.example.com/a", title: "A" }] }],
		["citations", { citations: [{ url: "https://www.example.com/a", title: "A" }] }],
		["result.links_on_page", { result: { links_on_page: [{ url: "https://www.example.com/a", title: "A" }] } }],
		["inline_references", { inline_references: [{ url: "https://www.example.com/a", title: "A" }] }],
	])("reads citations from %s", async (_label, shape) => {
		stubRun({ answer: "answer", ...shape });

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.citations).toEqual([
			{ url: "https://www.example.com/a", title: "A", domain: "example.com", citationIndex: 0 },
		]);
	});

	it("accepts sources given as bare URL strings", async () => {
		stubRun({ answer: "answer", sources: ["https://example.com/a"] });

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.citations.map((c) => c.url)).toEqual(["https://example.com/a"]);
	});

	it("skips unparseable URLs and keeps the rest numbered in order", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		stubRun({
			answer: "answer",
			sources: [{ url: "not a url" }, { url: "https://example.com/a" }, { url: "https://example.com/b" }],
		});

		const result = await olostep.run("chatgpt", "prompt");

		expect(result.citations.map((c) => [c.url, c.citationIndex])).toEqual([
			["https://example.com/a", 0],
			["https://example.com/b", 1],
		]);
	});
});

describe("olostep validateTarget", () => {
	it("accepts a supported model configured with web search", () => {
		expect(olostep.validateTarget?.({ model: "perplexity", provider: "olostep", webSearch: true })).toBeNull();
	});

	it("rejects a model Olostep has no parser for", () => {
		expect(olostep.validateTarget?.({ model: "claude", provider: "olostep", webSearch: true })).toContain(
			'does not support model "claude"',
		);
	});

	// These surfaces always search, so an offline target would misdescribe what
	// the run actually did.
	it("rejects a target configured without web search", () => {
		expect(olostep.validateTarget?.({ model: "chatgpt", provider: "olostep", webSearch: false })).toContain(
			"requires :online",
		);
	});
});
