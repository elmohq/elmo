import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});
