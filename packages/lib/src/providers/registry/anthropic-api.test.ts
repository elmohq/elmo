import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ANTHROPIC_WEB_SEARCH_MAX_USES, API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";

const anthropicClient = vi.hoisted(() => ({ create: vi.fn() }));
const aiMock = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", () => ({
	generateText: aiMock.generateText,
	Output: { object: vi.fn() },
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: class {
		messages = { create: anthropicClient.create };
	},
}));

import { anthropicApi } from "./anthropic-api";

const CAP = API_PROVIDER_MAX_OUTPUT_TOKENS["anthropic-api"];

beforeEach(() => {
	anthropicClient.create.mockResolvedValue({ content: [], model: "claude-sonnet-4-6" });
	aiMock.generateText.mockResolvedValue({ output: { answer: "ok" } });
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

function sentArgs(): Record<string, any> {
	return anthropicClient.create.mock.calls[0][0] as Record<string, any>;
}

describe("anthropic-api run", () => {
	it("caps output tokens for structured research", async () => {
		const checkpointResult = vi.fn().mockResolvedValue(undefined);
		const result = await anthropicApi.runStructuredResearch?.({
			prompt: "prompt",
			schema: z.object({ answer: z.string() }),
			webSearch: false,
			checkpointResult,
		});

		expect(aiMock.generateText.mock.calls[0][0].maxOutputTokens).toBe(CAP);
		expect(aiMock.generateText.mock.calls[0][0].maxRetries).toBe(0);
		expect(checkpointResult).toHaveBeenCalledWith(result);
	});

	it("does not return structured work before its checkpoint succeeds", async () => {
		const checkpointError = new Error("checkpoint unavailable");

		await expect(
			anthropicApi.runStructuredResearch?.({
				prompt: "prompt",
				schema: z.object({ answer: z.string() }),
				checkpointResult: vi.fn().mockRejectedValue(checkpointError),
			}),
		).rejects.toBe(checkpointError);
	});

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

	it("checkpoints the exact JSON-safe raw response before returning", async () => {
		anthropicClient.create.mockResolvedValue({
			content: [{ type: "text", text: "answer" }],
			model: "claude-sonnet-4-6",
		});
		const checkpointRawResponse = vi.fn();

		const result = await anthropicApi.run("claude", "prompt", {
			version: "claude-sonnet-4-6",
			checkpointRawResponse,
		});

		expect(checkpointRawResponse).toHaveBeenCalledWith({
			rawOutput: result.rawOutput,
			modelVersion: result.modelVersion,
		});
	});

	it("does not classify a provider tool failure as a successful raw response", async () => {
		anthropicClient.create.mockResolvedValue({
			content: [
				{
					type: "web_search_tool_result",
					content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
				},
			],
			model: "claude-sonnet-4-6",
		});
		const checkpointRawResponse = vi.fn();

		await expect(
			anthropicApi.run("claude", "prompt", {
				webSearch: true,
				version: "claude-sonnet-4-6",
				checkpointRawResponse,
			}),
		).rejects.toThrow("Anthropic web search failed: max_uses_exceeded");
		expect(checkpointRawResponse).not.toHaveBeenCalled();
	});
});
