import { describe, it, expect } from "vitest";
import {
	KNOWN_MODELS,
	getModelMeta,
} from "./models";

describe("KNOWN_MODELS", () => {
	it("has entries for all 8 standard models", () => {
		expect(Object.keys(KNOWN_MODELS)).toEqual(
			expect.arrayContaining([
				"chatgpt",
				"claude",
				"google-ai-mode",
				"google-ai-overview",
				"gemini",
				"copilot",
				"perplexity",
				"grok",
			]),
		);
		expect(Object.keys(KNOWN_MODELS)).toHaveLength(8);
	});

	it("has label and iconId for every entry", () => {
		for (const [key, meta] of Object.entries(KNOWN_MODELS)) {
			expect(meta.label).toBeTruthy();
			expect(meta.iconId).toBeTruthy();
		}
	});
});

describe("getModelMeta", () => {
	it("returns exact metadata for known models", () => {
		expect(getModelMeta("chatgpt")).toEqual({ label: "ChatGPT", iconId: "openai" });
		expect(getModelMeta("claude")).toEqual({ label: "Claude", iconId: "anthropic" });
		expect(getModelMeta("google-ai-mode")).toEqual({ label: "Google AI Mode", iconId: "google" });
		expect(getModelMeta("google-ai-overview")).toEqual({ label: "Google AI Overview", iconId: "google" });
		expect(getModelMeta("gemini")).toEqual({ label: "Gemini", iconId: "google" });
		expect(getModelMeta("copilot")).toEqual({ label: "Copilot", iconId: "microsoft" });
		expect(getModelMeta("perplexity")).toEqual({ label: "Perplexity", iconId: "perplexity" });
		expect(getModelMeta("grok")).toEqual({ label: "Grok", iconId: "x" });
	});

	it("auto-capitalizes single-word unknown models", () => {
		expect(getModelMeta("qwen")).toEqual({ label: "Qwen", iconId: "generic" });
		expect(getModelMeta("deepseek")).toEqual({ label: "Deepseek", iconId: "generic" });
		expect(getModelMeta("mistral")).toEqual({ label: "Mistral", iconId: "generic" });
	});

	it("auto-capitalizes hyphenated unknown models", () => {
		expect(getModelMeta("my-custom-model")).toEqual({ label: "My Custom Model", iconId: "generic" });
	});

	it("uses generic iconId for unknown models", () => {
		const meta = getModelMeta("some-new-ai");
		expect(meta.iconId).toBe("generic");
	});

	it("handles empty string gracefully", () => {
		const meta = getModelMeta("");
		expect(meta.iconId).toBe("generic");
	});
});

