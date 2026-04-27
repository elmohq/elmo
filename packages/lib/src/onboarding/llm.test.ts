import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRobustJson, resolveResearchTarget, runStructuredResearchPrompt } from "./llm";
import { z } from "zod";

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

describe("parseRobustJson", () => {
	it("extracts JSON from <out> tags", async () => {
		await expect(parseRobustJson(`<out>{"foo":"bar"}</out>`)).resolves.toEqual({ foo: "bar" });
	});

	it("extracts JSON from a fenced code block", async () => {
		const text = "Sure thing!\n```json\n{\"x\": 1}\n```";
		await expect(parseRobustJson(text)).resolves.toEqual({ x: 1 });
	});

	it("extracts a bare JSON object embedded in prose", async () => {
		const text = `Some preamble. {"hello":"world"} and then some more.`;
		await expect(parseRobustJson(text)).resolves.toEqual({ hello: "world" });
	});

	it("strips a fenced code block nested inside <out>", async () => {
		const text = "<out>\n```json\n[1,2,3]\n```\n</out>";
		await expect(parseRobustJson(text)).resolves.toEqual([1, 2, 3]);
	});

	it("handles a pure JSON response", async () => {
		await expect(parseRobustJson('{"a":1}')).resolves.toEqual({ a: 1 });
	});

	it("recovers JSON when there is trailing prose after the closing tag", async () => {
		const text = `<out>{"foo":"bar"}</out>\n\nhope this helps!`;
		await expect(parseRobustJson(text)).resolves.toEqual({ foo: "bar" });
	});

	it("throws on empty input", async () => {
		await expect(parseRobustJson("")).rejects.toThrow();
		await expect(parseRobustJson("   ")).rejects.toThrow();
	});

	it("throws on text with no JSON at all", async () => {
		await expect(parseRobustJson("just words, no json here")).rejects.toThrow();
	});
});

describe("runStructuredResearchPrompt — scraper two-pass", () => {
	it("does two scraper calls (research + format) and parses the format reply", async () => {
		const schema = z.object({ name: z.string(), tags: z.array(z.string()) });
		const calls: Array<{ model: string; prompt: string; webSearch?: boolean }> = [];

		const provider = {
			id: "fake-scraper",
			name: "Fake",
			defaultResearchModel: "gemini",
			isConfigured: () => true,
			run: vi.fn(async (model: string, prompt: string, opts?: { webSearch?: boolean }) => {
				calls.push({ model, prompt, webSearch: opts?.webSearch });
				if (calls.length === 1) {
					return {
						textContent: `# Acme research\n\nName: Acme. Tags: widgets, gadgets.`,
						rawOutput: {},
						webQueries: [],
						citations: [],
					};
				}
				return {
					textContent: `<out>{"name":"Acme","tags":["widgets","gadgets"]}</out>`,
					rawOutput: {},
					webQueries: [],
					citations: [],
				};
			}),
		} as any;

		const result = await runStructuredResearchPrompt("Tell me about Acme", {
			schema,
			target: { provider, model: "gemini" },
		});

		expect(result).toEqual({ name: "Acme", tags: ["widgets", "gadgets"] });
		expect(provider.run).toHaveBeenCalledTimes(2);
		// Pass 1 has web search on; pass 2 has it off.
		expect(calls[0].webSearch).toBe(true);
		expect(calls[1].webSearch).toBe(false);
		// Pass 2 prompt embeds pass 1's research text.
		expect(calls[1].prompt).toContain("Acme research");
		expect(calls[1].prompt).toContain("Tell me about Acme");
	});
});

describe("resolveResearchTarget", () => {
	it("uses the explicit env override when set", () => {
		process.env.ANTHROPIC_API_KEY = "x";
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
