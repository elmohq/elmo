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
	anthropicClient.create.mockResolvedValue({ content: [], model: "claude-sonnet-4-6" });
});

afterEach(() => {
	vi.clearAllMocks();
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
});
