import { describe, it, expect } from "vitest";
import {
	KNOWN_ENGINES,
	getEngineMeta,
	ENGINE_TO_LEGACY_MODEL_GROUP,
	LEGACY_MODEL_GROUP_TO_ENGINE,
} from "./engines";

describe("KNOWN_ENGINES", () => {
	it("has entries for all 8 standard engines", () => {
		expect(Object.keys(KNOWN_ENGINES)).toEqual(
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
		expect(Object.keys(KNOWN_ENGINES)).toHaveLength(8);
	});

	it("has label and iconId for every entry", () => {
		for (const [key, meta] of Object.entries(KNOWN_ENGINES)) {
			expect(meta.label).toBeTruthy();
			expect(meta.iconId).toBeTruthy();
		}
	});
});

describe("getEngineMeta", () => {
	it("returns exact metadata for known engines", () => {
		expect(getEngineMeta("chatgpt")).toEqual({ label: "ChatGPT", iconId: "openai" });
		expect(getEngineMeta("claude")).toEqual({ label: "Claude", iconId: "anthropic" });
		expect(getEngineMeta("google-ai-mode")).toEqual({ label: "Google AI Mode", iconId: "google" });
		expect(getEngineMeta("google-ai-overview")).toEqual({ label: "Google AI Overview", iconId: "google" });
		expect(getEngineMeta("gemini")).toEqual({ label: "Gemini", iconId: "google" });
		expect(getEngineMeta("copilot")).toEqual({ label: "Copilot", iconId: "microsoft" });
		expect(getEngineMeta("perplexity")).toEqual({ label: "Perplexity", iconId: "perplexity" });
		expect(getEngineMeta("grok")).toEqual({ label: "Grok", iconId: "x" });
	});

	it("auto-capitalizes single-word unknown engines", () => {
		expect(getEngineMeta("qwen")).toEqual({ label: "Qwen", iconId: "generic" });
		expect(getEngineMeta("deepseek")).toEqual({ label: "Deepseek", iconId: "generic" });
		expect(getEngineMeta("mistral")).toEqual({ label: "Mistral", iconId: "generic" });
	});

	it("auto-capitalizes hyphenated unknown engines", () => {
		expect(getEngineMeta("my-custom-engine")).toEqual({ label: "My Custom Engine", iconId: "generic" });
	});

	it("uses generic iconId for unknown engines", () => {
		const meta = getEngineMeta("some-new-ai");
		expect(meta.iconId).toBe("generic");
	});

	it("handles empty string gracefully", () => {
		const meta = getEngineMeta("");
		expect(meta.iconId).toBe("generic");
	});
});

describe("legacy mapping constants", () => {
	it("maps engines to legacy model groups", () => {
		expect(ENGINE_TO_LEGACY_MODEL_GROUP.chatgpt).toBe("openai");
		expect(ENGINE_TO_LEGACY_MODEL_GROUP.claude).toBe("anthropic");
		expect(ENGINE_TO_LEGACY_MODEL_GROUP["google-ai-mode"]).toBe("google");
	});

	it("maps legacy model groups back to engines", () => {
		expect(LEGACY_MODEL_GROUP_TO_ENGINE.openai).toBe("chatgpt");
		expect(LEGACY_MODEL_GROUP_TO_ENGINE.anthropic).toBe("claude");
		expect(LEGACY_MODEL_GROUP_TO_ENGINE.google).toBe("google-ai-mode");
	});

	it("has consistent bidirectional mapping", () => {
		for (const [engine, group] of Object.entries(ENGINE_TO_LEGACY_MODEL_GROUP)) {
			expect(LEGACY_MODEL_GROUP_TO_ENGINE[group]).toBe(engine);
		}
	});
});
