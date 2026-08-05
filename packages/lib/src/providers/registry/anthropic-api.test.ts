import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ANTHROPIC_WEB_SEARCH_MAX_USES, API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";

const anthropicClient = vi.hoisted(() => ({ create: vi.fn(), constructorOptions: vi.fn() }));
const aiMock = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", () => ({
	generateText: aiMock.generateText,
	Output: { object: vi.fn() },
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: class {
		constructor(options: unknown) {
			anthropicClient.constructorOptions(options);
		}
		messages = { create: anthropicClient.create };
	},
}));

import { anthropicApi } from "./anthropic-api";

const CAP = API_PROVIDER_MAX_OUTPUT_TOKENS["anthropic-api"];

beforeEach(() => {
	anthropicClient.create.mockResolvedValue({ content: [], model: "claude-sonnet-4-6" });
	aiMock.generateText.mockResolvedValue({ output: { ok: true } });
});

describe("anthropic-api structured research", () => {
	it("passes strict retry and native-search budgets to the AI SDK", async () => {
		await anthropicApi.runStructuredResearch?.({
			prompt: "prompt",
			schema: z.object({ ok: z.boolean() }),
			maxRetries: 0,
			maxWebSearchUses: 3,
		});

		const args = aiMock.generateText.mock.calls[0][0] as Record<string, any>;
		expect(args.maxRetries).toBe(0);
		expect(args.tools.web_search).toBeDefined();
	});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

function sentArgs(): Record<string, any> {
	return anthropicClient.create.mock.calls[0][0] as Record<string, any>;
}

describe("anthropic-api run", () => {
	it("caps output tokens and bounds web-search uses when webSearch is on", async () => {
		await anthropicApi.run("claude", "prompt", { webSearch: true, version: "claude-sonnet-4-6" });

		const args = sentArgs();
		expect(args.max_tokens).toBe(CAP);
		expect(args.tools).toEqual([
			{ type: "web_search_20250305", name: "web_search", max_uses: ANTHROPIC_WEB_SEARCH_MAX_USES },
		]);
	});

	it("caps output tokens and sends no web_search tool when webSearch is off", async () => {
		await anthropicApi.run("claude", "prompt", { webSearch: false, version: "claude-sonnet-4-6" });

		const args = sentArgs();
		expect(args.max_tokens).toBe(CAP);
		expect(args).not.toHaveProperty("tools");
	});

	it("logs a warning when the response stops on the output cap", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		anthropicClient.create.mockResolvedValue({
			content: [],
			model: "claude-sonnet-4-6",
			stop_reason: "max_tokens",
		});

		await anthropicApi.run("claude", "prompt", { webSearch: false, version: "claude-sonnet-4-6" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
	});

	it("returns billing metadata exposed by the typed Anthropic response", async () => {
		anthropicClient.create.mockResolvedValue({
			id: "msg_123",
			content: [],
			model: "claude-sonnet-4-6",
			usage: {
				input_tokens: 42,
				output_tokens: 17,
				server_tool_use: { web_search_requests: 1 },
			},
		});

		const result = await anthropicApi.run("claude", "prompt", {
			webSearch: true,
			version: "claude-sonnet-4-6",
		});

		expect(result.providerCall).toEqual({
			providerRequestId: "msg_123",
			inputTokens: 42,
			outputTokens: 17,
			webSearchRequests: 1,
		});
	});

	it("surfaces a server-tool error without making an unmetered internal retry", async () => {
		anthropicClient.create.mockResolvedValue({
			content: [
				{
					type: "web_search_tool_result",
					content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
				},
			],
			model: "claude-sonnet-4-6",
		});

		await expect(
			anthropicApi.run("claude", "prompt", {
				webSearch: true,
				version: "claude-sonnet-4-6",
				maxRetries: 0,
			}),
		).rejects.toThrow("max_uses_exceeded");
		expect(anthropicClient.create).toHaveBeenCalledOnce();
		expect(anthropicClient.constructorOptions).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
	});
});
