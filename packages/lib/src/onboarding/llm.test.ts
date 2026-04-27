import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractJsonFromText, resolveResearchTarget } from "./llm";

const ENV_KEYS = [
	"ONBOARDING_LLM_TARGET",
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"OPENROUTER_API_KEY",
	"OLOSTEP_API_KEY",
	"BRIGHTDATA_API_TOKEN",
];

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
	// Snapshot then clear so each test gets a clean slate.
	for (const key of ENV_KEYS) {
		savedEnv[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		const v = savedEnv[key];
		if (v === undefined) delete process.env[key];
		else process.env[key] = v;
	}
});

describe("extractJsonFromText", () => {
	it("extracts JSON from <out> tags", () => {
		expect(extractJsonFromText(`<out>{"foo":"bar"}</out>`)).toEqual({ foo: "bar" });
	});

	it("extracts JSON from a fenced code block", () => {
		const text = "Sure thing!\n```json\n{\"x\": 1}\n```";
		expect(extractJsonFromText(text)).toEqual({ x: 1 });
	});

	it("extracts a bare JSON object embedded in prose", () => {
		const text = `Some preamble. {"hello":"world"} and then some more.`;
		expect(extractJsonFromText(text)).toEqual({ hello: "world" });
	});

	it("strips a fenced code block nested inside <out>", () => {
		const text = "<out>\n```json\n[1,2,3]\n```\n</out>";
		expect(extractJsonFromText(text)).toEqual([1, 2, 3]);
	});

	it("handles a pure JSON response", () => {
		expect(extractJsonFromText('{"a":1}')).toEqual({ a: 1 });
	});

	it("throws on empty input", () => {
		expect(() => extractJsonFromText("")).toThrow();
		expect(() => extractJsonFromText("   ")).toThrow();
	});

	it("throws on non-JSON text", () => {
		expect(() => extractJsonFromText("just words, no json here")).toThrow();
	});
});

describe("resolveResearchTarget", () => {
	it("uses the explicit env override when set", () => {
		process.env.ANTHROPIC_API_KEY = "x"; // ONBOARDING_LLM_TARGET points at this provider
		const target = resolveResearchTarget({
			ANTHROPIC_API_KEY: "x",
			ONBOARDING_LLM_TARGET: "claude:anthropic-api:claude-3-5-haiku-20241022",
		});
		expect(target.provider.id).toBe("anthropic-api");
		expect(target.model).toBe("claude-3-5-haiku-20241022");
	});

	it("throws when ONBOARDING_LLM_TARGET points at an unconfigured provider", () => {
		expect(() =>
			resolveResearchTarget({
				ONBOARDING_LLM_TARGET: "chatgpt:openai-api:gpt-5-mini",
			}),
		).toThrow(/isn't configured/);
	});

	it("prefers Anthropic when ANTHROPIC_API_KEY is set", () => {
		process.env.ANTHROPIC_API_KEY = "x";
		const target = resolveResearchTarget({ ANTHROPIC_API_KEY: "x" });
		expect(target.provider.id).toBe("anthropic-api");
		expect(target.model).toBe("claude-sonnet-4-20250514");
	});

	it("prefers OpenAI over OpenRouter when both are set but Anthropic isn't", () => {
		process.env.OPENAI_API_KEY = "x";
		process.env.OPENROUTER_API_KEY = "y";
		const target = resolveResearchTarget({ OPENAI_API_KEY: "x", OPENROUTER_API_KEY: "y" });
		expect(target.provider.id).toBe("openai-api");
	});

	it("falls back to OpenRouter Gemini when only OpenRouter is set", () => {
		process.env.OPENROUTER_API_KEY = "x";
		const target = resolveResearchTarget({ OPENROUTER_API_KEY: "x" });
		expect(target.provider.id).toBe("openrouter");
		expect(target.model).toBe("google/gemini-2.5-flash");
	});

	it("falls back to Olostep Gemini when only Olostep is set", () => {
		process.env.OLOSTEP_API_KEY = "x";
		const target = resolveResearchTarget({ OLOSTEP_API_KEY: "x" });
		expect(target.provider.id).toBe("olostep");
		expect(target.model).toBe("gemini");
	});

	it("falls back to BrightData Gemini when only BrightData is set", () => {
		process.env.BRIGHTDATA_API_TOKEN = "x";
		const target = resolveResearchTarget({ BRIGHTDATA_API_TOKEN: "x" });
		expect(target.provider.id).toBe("brightdata");
		expect(target.model).toBe("gemini");
	});

	it("prefers direct APIs over scrapers", () => {
		process.env.OPENROUTER_API_KEY = "x";
		process.env.OLOSTEP_API_KEY = "y";
		const target = resolveResearchTarget({ OPENROUTER_API_KEY: "x", OLOSTEP_API_KEY: "y" });
		expect(target.provider.id).toBe("openrouter");
	});

	it("throws when no provider is configured", () => {
		expect(() => resolveResearchTarget({})).toThrow(/at least one LLM provider/);
	});
});
