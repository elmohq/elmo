import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, OPENAI_WEB_SEARCH_MAX_TOOL_CALLS } from "../config";

const aiMock = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", () => ({
	generateText: aiMock.generateText,
	Output: { object: vi.fn() },
}));

import { openaiApi } from "./openai-api";

const CAP = API_PROVIDER_MAX_OUTPUT_TOKENS["openai-api"];

beforeEach(() => {
	aiMock.generateText.mockResolvedValue({ text: "answer" });
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

	it("stores the Responses payload and reads its searches back out", async () => {
		// Shaped like a real gpt-5-mini response: reasoning and web_search_call
		// items around the message, annotations on the output_text.
		const body = {
			id: "resp_1",
			object: "response",
			output: [
				{ id: "rs_1", type: "reasoning", summary: [] },
				{
					id: "ws_1",
					type: "web_search_call",
					status: "completed",
					action: {
						type: "search",
						queries: ["best crm 2026", "crm pricing"],
						query: "best crm 2026",
						sources: [{ type: "url", url: "https://example.com/a" }],
					},
				},
				{
					id: "ws_2",
					type: "web_search_call",
					action: { type: "search", query: "crm reviews" },
				},
				{
					id: "msg_1",
					type: "message",
					content: [
						{
							type: "output_text",
							text: "answer",
							annotations: [{ type: "url_citation", url: "https://example.com/a", title: "A" }],
						},
					],
				},
			],
		};
		aiMock.generateText.mockResolvedValue({ text: "answer", response: { body } });

		const result = await openaiApi.run("chatgpt", "prompt", { webSearch: true, version: "gpt-5-mini" });

		expect(result.rawOutput).toBe(body);
		expect(result.webQueries).toEqual(["best crm 2026", "crm pricing", "crm reviews"]);
		expect(result.textContent).toBe("answer");
		expect(result.citations.map((c) => c.url)).toEqual(["https://example.com/a"]);
	});

	it("falls back to the rebuilt payload when the SDK reports no response body", async () => {
		aiMock.generateText.mockResolvedValue({
			text: "answer",
			content: [
				{ type: "tool-call", toolName: "web_search", input: {} },
				{
					type: "tool-result",
					toolName: "web_search",
					output: { action: { type: "search", queries: ["best crm 2026", "crm pricing"] } },
				},
				{ type: "tool-result", toolName: "web_search", output: { action: { type: "search", query: "crm reviews" } } },
				{ type: "text", text: "answer" },
			],
		});

		const result = await openaiApi.run("chatgpt", "prompt", { webSearch: true, version: "gpt-5-mini" });

		expect(result.webQueries).toEqual(["best crm 2026", "crm pricing", "crm reviews"]);
		// The rebuilt payload carries no web_search_call items, so re-extracting
		// from this stored shape can never recover the queries above.
		expect(result.rawOutput).toEqual({
			output: [{ type: "message", content: [{ type: "output_text", text: "answer", annotations: [] }] }],
		});
	});

	it("ignores non-search web_search actions", async () => {
		aiMock.generateText.mockResolvedValue({
			text: "answer",
			content: [
				{
					type: "tool-result",
					toolName: "web_search",
					output: { action: { type: "openPage", url: "https://example.com" } },
				},
			],
		});

		const result = await openaiApi.run("chatgpt", "prompt", { webSearch: true, version: "gpt-5-mini" });

		expect(result.webQueries).toEqual([WEB_QUERIES_UNAVAILABLE]);
	});

	it("marks queries unavailable when web search ran but exposed no query strings", async () => {
		const result = await openaiApi.run("chatgpt", "prompt", { webSearch: true, version: "gpt-5-mini" });

		expect(result.webQueries).toEqual([WEB_QUERIES_UNAVAILABLE]);
	});

	it("reports no queries when web search is off", async () => {
		const result = await openaiApi.run("chatgpt", "prompt", { webSearch: false, version: "gpt-5-mini" });

		expect(result.webQueries).toEqual([]);
	});

	it("logs a warning when the response stops on the output cap", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		aiMock.generateText.mockResolvedValue({ text: "clipped", finishReason: "length" });

		await openaiApi.run("chatgpt", "prompt", { webSearch: false, version: "gpt-5-mini" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
	});
});
