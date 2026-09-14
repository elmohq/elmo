import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, OPENAI_WEB_SEARCH_MAX_TOOL_CALLS } from "../config";

const aiMock = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", () => ({
	generateText: aiMock.generateText,
	Output: { object: vi.fn() },
}));

import { openaiApi } from "./openai-api";

const CAP = API_PROVIDER_MAX_OUTPUT_TOKENS["openai-api"];

/** `sources` and `content` are non-optional on a real generateText result. */
function generated(over: Record<string, any> = {}) {
	return { text: "answer", sources: [], content: [], ...over };
}

beforeEach(() => {
	aiMock.generateText.mockResolvedValue(generated());
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

function sentArgs(): Record<string, any> {
	return aiMock.generateText.mock.calls[0][0] as Record<string, any>;
}

describe("openai-api run", () => {
	it("caps output tokens and bounds web-search tool calls when webSearch is on", async () => {
		await openaiApi.run("chatgpt", "prompt", { webSearch: true, version: "gpt-5-mini" });

		const args = sentArgs();
		expect(args.maxOutputTokens).toBe(CAP);
		expect(args.toolChoice).toBe("auto");
		expect(args.tools).toHaveProperty("web_search");
		expect(args.providerOptions).toEqual({ openai: { maxToolCalls: OPENAI_WEB_SEARCH_MAX_TOOL_CALLS } });
	});

	it("caps output tokens and sends no tool-call budget when webSearch is off", async () => {
		await openaiApi.run("chatgpt", "prompt", { webSearch: false, version: "gpt-5-mini" });

		const args = sentArgs();
		expect(args.maxOutputTokens).toBe(CAP);
		expect(args.toolChoice).toBe("none");
		expect(args).not.toHaveProperty("tools");
		expect(args).not.toHaveProperty("providerOptions");
	});

	it("logs a warning when the response stops on the output cap", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		aiMock.generateText.mockResolvedValue(generated({ text: "clipped", finishReason: "length" }));

		await openaiApi.run("chatgpt", "prompt", { webSearch: false, version: "gpt-5-mini" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
	});
});

describe("openai-api citations", () => {
	it("keeps url sources and ignores document sources", async () => {
		aiMock.generateText.mockResolvedValue(
			generated({
				sources: [
					{ type: "source", sourceType: "url", id: "1", url: "https://example.com/a", title: "A" },
					{ type: "source", sourceType: "document", id: "2", mediaType: "application/pdf", title: "B" },
				],
			}),
		);

		const res = await openaiApi.run("chatgpt", "prompt", { webSearch: true, version: "gpt-5-mini" });

		expect(res.citations).toEqual([
			{ url: "https://example.com/a", title: "A", domain: "example.com", citationIndex: 0 },
		]);
	});
});

describe("openai-api web queries", () => {
	function searchResult(action: Record<string, any>) {
		return generated({ content: [{ type: "tool-result", toolName: "web_search", output: { action } }] });
	}

	it("reports the query the provider-run search actually issued", async () => {
		aiMock.generateText.mockResolvedValue(searchResult({ type: "search", query: "elmo aeo" }));

		const res = await openaiApi.run("chatgpt", "prompt", { webSearch: true, version: "gpt-5-mini" });

		expect(res.webQueries).toEqual(["elmo aeo"]);
	});

	it("reports every query when the search fans out", async () => {
		aiMock.generateText.mockResolvedValue(searchResult({ type: "search", queries: ["one", "two"] }));

		const res = await openaiApi.run("chatgpt", "prompt", { webSearch: true, version: "gpt-5-mini" });

		expect(res.webQueries).toEqual(["one", "two"]);
	});

	it("reports nothing for non-search actions", async () => {
		aiMock.generateText.mockResolvedValue(searchResult({ type: "openPage", url: "https://example.com" }));

		const res = await openaiApi.run("chatgpt", "prompt", { webSearch: false, version: "gpt-5-mini" });

		expect(res.webQueries).toEqual([]);
	});
});
