import { describe, expect, it } from "vitest";
import { extractJsonFromText, resolveOnboardingTarget } from "./llm";

describe("extractJsonFromText", () => {
	it("extracts JSON from <out> tags", () => {
		const text = `Here is your data:\n<out>\n{ "foo": "bar" }\n</out>\nDone.`;
		expect(extractJsonFromText(text)).toEqual({ foo: "bar" });
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

describe("resolveOnboardingTarget", () => {
	it("uses the explicit env override when set", () => {
		const target = resolveOnboardingTarget({
			ONBOARDING_LLM_TARGET: "claude:anthropic-api:claude-sonnet-4-20250514:online",
		});
		expect(target).toEqual({
			model: "claude",
			provider: "anthropic-api",
			version: "claude-sonnet-4-20250514",
			webSearch: true,
		});
	});

	it("prefers Anthropic when only ANTHROPIC_API_KEY is set", () => {
		const target = resolveOnboardingTarget({ ANTHROPIC_API_KEY: "x" });
		expect(target.provider).toBe("anthropic-api");
		expect(target.webSearch).toBe(true);
	});

	it("falls back to OpenAI when only OPENAI_API_KEY is set", () => {
		const target = resolveOnboardingTarget({ OPENAI_API_KEY: "x" });
		expect(target.provider).toBe("openai-api");
	});

	it("falls back to OpenRouter Gemini when only OPENROUTER_API_KEY is set", () => {
		const target = resolveOnboardingTarget({ OPENROUTER_API_KEY: "x" });
		expect(target).toMatchObject({ provider: "openrouter", model: "gemini" });
	});

	it("falls back to Olostep Gemini when only OLOSTEP_API_KEY is set", () => {
		const target = resolveOnboardingTarget({ OLOSTEP_API_KEY: "x" });
		expect(target).toMatchObject({ provider: "olostep", model: "gemini" });
	});

	it("falls back to BrightData Gemini when only BRIGHTDATA_API_TOKEN is set", () => {
		const target = resolveOnboardingTarget({ BRIGHTDATA_API_TOKEN: "x" });
		expect(target).toMatchObject({ provider: "brightdata", model: "gemini" });
	});

	it("throws when no provider is configured", () => {
		expect(() => resolveOnboardingTarget({})).toThrow(/at least one LLM provider/);
	});

	it("respects the ONBOARDING_ANTHROPIC_MODEL override", () => {
		const target = resolveOnboardingTarget({
			ANTHROPIC_API_KEY: "x",
			ONBOARDING_ANTHROPIC_MODEL: "claude-3-5-haiku-20241022",
		});
		expect(target.version).toBe("claude-3-5-haiku-20241022");
	});
});
