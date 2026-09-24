import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANTHROPIC_WEB_SEARCH_MAX_USES, API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";

const anthropicClient = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
	default: class {
		messages = { create: anthropicClient.create };
	},
}));

import { anthropicApi } from "./anthropic-api";

const CAP = API_PROVIDER_MAX_OUTPUT_TOKENS["anthropic-api"];

beforeEach(() => {
	anthropicClient.create.mockResolvedValue({ content: [], model: "claude-sonnet-5" });
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
		await anthropicApi.run("claude", "prompt", { webSearch: true, version: "claude-sonnet-5" });

		const args = sentArgs();
		expect(args.max_tokens).toBe(CAP);
		expect(args.tools).toEqual([
			{ type: "web_search_20250305", name: "web_search", max_uses: ANTHROPIC_WEB_SEARCH_MAX_USES },
		]);
	});

	it("caps output tokens and sends no web_search tool when webSearch is off", async () => {
		await anthropicApi.run("claude", "prompt", { webSearch: false, version: "claude-sonnet-5" });

		const args = sentArgs();
		expect(args.max_tokens).toBe(CAP);
		expect(args).not.toHaveProperty("tools");
	});

	it("logs a warning when the response stops on the output cap", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		anthropicClient.create.mockResolvedValue({
			content: [],
			model: "claude-sonnet-5",
			stop_reason: "max_tokens",
		});

		await anthropicApi.run("claude", "prompt", { webSearch: false, version: "claude-sonnet-5" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
	});
});

describe("anthropic-api web search handling", () => {
	const searchBlocks = [
		{ type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "elmo aeo" } },
		{
			type: "web_search_tool_result",
			tool_use_id: "srv_1",
			content: [
				{
					type: "web_search_result",
					url: "https://example.com/a",
					title: "A",
					encrypted_content: "long page text",
					page_age: null,
				},
			],
		},
	];

	it("reports the query the server-side search issued", async () => {
		anthropicClient.create.mockResolvedValue({ content: searchBlocks, model: "claude-sonnet-5" });

		const res = await anthropicApi.run("claude", "prompt", { webSearch: true, version: "claude-sonnet-5" });

		expect(res.webQueries).toEqual(["elmo aeo"]);
	});

	it("drops the fetched page text from what it stores but keeps url and title", async () => {
		anthropicClient.create.mockResolvedValue({ content: searchBlocks, model: "claude-sonnet-5" });

		const res = await anthropicApi.run("claude", "prompt", { webSearch: true, version: "claude-sonnet-5" });
		const stored = (res.rawOutput as any).content.find((b: any) => b.type === "web_search_tool_result");

		expect(stored.content).toEqual([{ type: "web_search_result", url: "https://example.com/a", title: "A" }]);
	});

	it("retries once when the search itself errored", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.useFakeTimers();
		anthropicClient.create
			.mockResolvedValueOnce({
				content: [
					{
						type: "web_search_tool_result",
						tool_use_id: "srv_1",
						content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
					},
				],
				model: "claude-sonnet-5",
			})
			.mockResolvedValue({ content: searchBlocks, model: "claude-sonnet-5" });

		const run = anthropicApi.run("claude", "prompt", { webSearch: true, version: "claude-sonnet-5" });
		await vi.runAllTimersAsync();
		const res = await run;

		expect(anthropicClient.create).toHaveBeenCalledTimes(2);
		expect(res.webQueries).toEqual(["elmo aeo"]);
		vi.useRealTimers();
	});
});
