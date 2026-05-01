import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { resolveResearchTarget, runStructuredResearchPrompt } from "./llm";

const ENV_KEYS = [
	"ONBOARDING_LLM_TARGET",
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"OPENROUTER_API_KEY",
	"OLOSTEP_API_KEY",
	"BRIGHTDATA_API_TOKEN",
	"MISTRAL_API_KEY",
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

	it("throws when ONBOARDING_LLM_TARGET points at a scraper", () => {
		process.env.OLOSTEP_API_KEY = "x";
		expect(() =>
			resolveResearchTarget({
				OLOSTEP_API_KEY: "x",
				ONBOARDING_LLM_TARGET: "gemini:olostep:online",
			}),
		).toThrow(/does not support structured research/);
	});

	it("prefers OpenAI direct first when configured", () => {
		// provider.isConfigured() reads from process.env, not the function's
		// env arg — set both so ONBOARDING_LLM_TARGET lookup and the
		// per-provider config probe see the same world.
		process.env.OPENAI_API_KEY = "a";
		process.env.OPENROUTER_API_KEY = "b";
		process.env.ANTHROPIC_API_KEY = "c";
		process.env.MISTRAL_API_KEY = "d";
		const target = resolveResearchTarget();
		expect(target.provider.id).toBe("openai-api");
	});

	it("falls back to OpenRouter when OpenAI direct isn't configured", () => {
		process.env.OPENROUTER_API_KEY = "b";
		process.env.ANTHROPIC_API_KEY = "c";
		process.env.MISTRAL_API_KEY = "d";
		const target = resolveResearchTarget();
		expect(target.provider.id).toBe("openrouter");
		// Default routes through gpt-5-mini — OpenRouter's plugins:[{web,native}]
		// supports OpenAI models, so the same model OpenAI-direct uses.
		expect(target.model).toBe("openai/gpt-5-mini");
	});

	it("falls back to Anthropic when OpenAI / OpenRouter aren't configured", () => {
		process.env.ANTHROPIC_API_KEY = "c";
		process.env.MISTRAL_API_KEY = "d";
		const target = resolveResearchTarget();
		expect(target.provider.id).toBe("anthropic-api");
	});

	it("falls back to Mistral when only Mistral is set", () => {
		process.env.MISTRAL_API_KEY = "x";
		const target = resolveResearchTarget();
		expect(target.provider.id).toBe("mistral-api");
	});

	it("ignores scraper providers entirely", () => {
		process.env.OLOSTEP_API_KEY = "x";
		process.env.BRIGHTDATA_API_TOKEN = "y";
		expect(() => resolveResearchTarget({ OLOSTEP_API_KEY: "x", BRIGHTDATA_API_TOKEN: "y" })).toThrow(
			/at least one direct LLM API/,
		);
	});

	it("throws when no provider is configured", () => {
		expect(() => resolveResearchTarget({})).toThrow(/at least one direct LLM API/);
	});
});

describe("runStructuredResearchPrompt", () => {
	it("forwards prompt + schema + model to the chosen provider's runStructuredResearch", async () => {
		const schema = z.object({ ok: z.boolean() });
		const calls: Array<{ prompt: string; model?: string }> = [];

		const provider = {
			id: "fake-direct-api",
			name: "Fake",
			defaultResearchModel: "fake-model-v1",
			isConfigured: () => true,
			run: vi.fn(),
			runStructuredResearch: vi.fn(async (opts: { prompt: string; schema: any; model?: string }) => {
				calls.push({ prompt: opts.prompt, model: opts.model });
				return {
					object: { ok: true },
					usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
					modelVersion: opts.model,
				};
			}),
		} as any;

		const result = await runStructuredResearchPrompt("hello", {
			schema,
			target: { provider, model: "fake-model-v1" },
		});

		expect(result).toEqual({ ok: true });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toEqual({ prompt: "hello", model: "fake-model-v1" });
	});

	it("throws when the resolved provider does not implement runStructuredResearch", async () => {
		const provider = {
			id: "broken",
			name: "Broken",
			defaultResearchModel: "x",
			isConfigured: () => true,
			run: vi.fn(),
		} as any;

		await expect(
			runStructuredResearchPrompt("hello", {
				schema: z.object({ ok: z.boolean() }),
				target: { provider, model: "x" },
			}),
		).rejects.toThrow(/does not implement structured research/);
	});
});
