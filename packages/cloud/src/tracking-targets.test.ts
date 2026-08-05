import { describe, expect, it } from "vitest";
import type { ModelConfig } from "@workspace/config/scrape-targets";
import { CLAUDE_NATIVE_WEB_TARGET_KEY, validateCloudTrackingTargets } from "./tracking-targets";

function validTargets(): ModelConfig[] {
	return [
		...[
			"chatgpt",
			"google-ai-mode",
			"google-ai-overview",
			"copilot",
			"perplexity",
			"gemini",
			"qwen",
			"deepseek",
		].map((model) => ({ model, provider: "stub", webSearch: true })),
		{
			targetKey: CLAUDE_NATIVE_WEB_TARGET_KEY,
			model: "claude",
			provider: "anthropic-api",
			version: "claude-sonnet-4-6",
			webSearch: true,
		},
	];
}

describe("validateCloudTrackingTargets", () => {
	it("accepts one execution mapping for every launch target", () => {
		expect(() => validateCloudTrackingTargets(validTargets())).not.toThrow();
	});

	it("rejects duplicate logical keys even when providers differ", () => {
		const configs = validTargets();
		configs.push({ targetKey: "chatgpt", model: "other-model", provider: "stub", webSearch: false });
		expect(() => validateCloudTrackingTargets(configs)).toThrow('target key "chatgpt" must be unique');
	});

	it("rejects missing plan targets", () => {
		expect(() => validateCloudTrackingTargets(validTargets().filter((target) => target.model !== "qwen"))).toThrow(
			'standard cloud target "qwen" is not configured',
		);
	});

	it("requires Claude's direct native web-search execution", () => {
		const configs = validTargets();
		const claude = configs.find((target) => target.targetKey === CLAUDE_NATIVE_WEB_TARGET_KEY)!;
		claude.provider = "openrouter";
		expect(() => validateCloudTrackingTargets(configs)).toThrow("must use claude:anthropic-api with native web search");
	});
});
