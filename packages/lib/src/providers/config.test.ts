import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseScrapeTargets, validateScrapeTargets } from "./config";

describe("parseScrapeTargets", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("basic parsing", () => {
		it("parses engine:provider", () => {
			const result = parseScrapeTargets("chatgpt:olostep");
			expect(result).toEqual([
				{ engine: "chatgpt", provider: "olostep", model: undefined, webSearch: false },
			]);
		});

		it("parses engine:provider:online", () => {
			const result = parseScrapeTargets("chatgpt:olostep:online");
			expect(result).toEqual([
				{ engine: "chatgpt", provider: "olostep", model: undefined, webSearch: true },
			]);
		});

		it("parses engine:provider:model", () => {
			const result = parseScrapeTargets("chatgpt:direct:gpt-5-mini");
			expect(result).toEqual([
				{ engine: "chatgpt", provider: "direct", model: "gpt-5-mini", webSearch: false },
			]);
		});

		it("parses engine:provider:model:online", () => {
			const result = parseScrapeTargets("chatgpt:direct:gpt-5-mini:online");
			expect(result).toEqual([
				{ engine: "chatgpt", provider: "direct", model: "gpt-5-mini", webSearch: true },
			]);
		});
	});

	describe("multiple entries", () => {
		it("parses comma-separated entries", () => {
			const result = parseScrapeTargets(
				"chatgpt:olostep:online,google-ai-mode:olostep:online,copilot:olostep:online",
			);
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ engine: "chatgpt", provider: "olostep", model: undefined, webSearch: true });
			expect(result[1]).toEqual({ engine: "google-ai-mode", provider: "olostep", model: undefined, webSearch: true });
			expect(result[2]).toEqual({ engine: "copilot", provider: "olostep", model: undefined, webSearch: true });
		});

		it("handles mixed providers", () => {
			const result = parseScrapeTargets(
				"chatgpt:olostep:online,claude:openrouter:anthropic/claude-sonnet-4,google-ai-mode:dataforseo:online",
			);
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ engine: "chatgpt", provider: "olostep", model: undefined, webSearch: true });
			expect(result[1]).toEqual({ engine: "claude", provider: "openrouter", model: "anthropic/claude-sonnet-4", webSearch: false });
			expect(result[2]).toEqual({ engine: "google-ai-mode", provider: "dataforseo", model: undefined, webSearch: true });
		});
	});

	describe("OpenRouter model slugs with colons", () => {
		it("handles :free variant suffix without web search", () => {
			const result = parseScrapeTargets("chatgpt:openrouter:openai/gpt-5-mini:free");
			expect(result).toEqual([
				{ engine: "chatgpt", provider: "openrouter", model: "openai/gpt-5-mini:free", webSearch: false },
			]);
		});

		it("handles :free variant suffix with web search", () => {
			const result = parseScrapeTargets("chatgpt:openrouter:openai/gpt-5-mini:free:online");
			expect(result).toEqual([
				{ engine: "chatgpt", provider: "openrouter", model: "openai/gpt-5-mini:free", webSearch: true },
			]);
		});

		it("handles complex model slug with multiple colon-separated parts", () => {
			const result = parseScrapeTargets("qwen:openrouter:qwen/qwen3.6-plus:free:online");
			expect(result).toEqual([
				{ engine: "qwen", provider: "openrouter", model: "qwen/qwen3.6-plus:free", webSearch: true },
			]);
		});
	});

	describe("custom/unknown engines", () => {
		it("accepts any engine name", () => {
			const result = parseScrapeTargets("deepseek:openrouter:deepseek/deepseek-v3:online");
			expect(result).toEqual([
				{ engine: "deepseek", provider: "openrouter", model: "deepseek/deepseek-v3", webSearch: true },
			]);
		});

		it("accepts engine names with hyphens", () => {
			const result = parseScrapeTargets("my-custom-engine:brightdata:online");
			expect(result).toEqual([
				{ engine: "my-custom-engine", provider: "brightdata", model: undefined, webSearch: true },
			]);
		});
	});

	describe("whitespace handling", () => {
		it("trims whitespace around entries", () => {
			const result = parseScrapeTargets(" chatgpt:olostep:online , google-ai-mode:olostep:online ");
			expect(result).toHaveLength(2);
			expect(result[0].engine).toBe("chatgpt");
			expect(result[1].engine).toBe("google-ai-mode");
		});
	});

	describe("error cases", () => {
		it("throws on empty string entries (trailing comma)", () => {
			expect(() => parseScrapeTargets("chatgpt:olostep,")).toThrow("empty entry");
		});

		it("throws on single-segment entries", () => {
			expect(() => parseScrapeTargets("chatgpt")).toThrow("need at least engine:provider");
		});
	});

	describe("missing SCRAPE_TARGETS", () => {
		it("throws when SCRAPE_TARGETS is undefined", () => {
			expect(() => parseScrapeTargets(undefined)).toThrow("SCRAPE_TARGETS environment variable is required");
		});

		it("throws when SCRAPE_TARGETS is empty string", () => {
			expect(() => parseScrapeTargets("")).toThrow("SCRAPE_TARGETS environment variable is required");
		});
	});
});

describe("validateScrapeTargets", () => {
	const configuredProvider = { isConfigured: () => true };
	const unconfiguredProvider = { isConfigured: () => false };

	function makeGetProvider(providers: Record<string, { isConfigured(): boolean }>) {
		return (id: string) => providers[id];
	}

	it("passes when all providers are configured", () => {
		const configs = [
			{ engine: "chatgpt", provider: "olostep", webSearch: true },
			{ engine: "google-ai-mode", provider: "olostep", webSearch: true },
		];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ olostep: configuredProvider })),
		).not.toThrow();
	});

	it("throws on unknown provider", () => {
		const configs = [{ engine: "chatgpt", provider: "nonexistent", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({}))).toThrow('unknown provider "nonexistent"');
	});

	it("throws when provider is not configured", () => {
		const configs = [{ engine: "chatgpt", provider: "olostep", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ olostep: unconfiguredProvider })),
		).toThrow("requires API key");
	});

	it("throws when direct provider has no model", () => {
		const configs = [{ engine: "chatgpt", provider: "direct", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ direct: configuredProvider })),
		).toThrow("requires a model slug");
	});

	it("throws when openrouter provider has no model", () => {
		const configs = [{ engine: "chatgpt", provider: "openrouter", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ openrouter: configuredProvider })),
		).toThrow("requires a model slug");
	});

	it("passes when direct provider has a model", () => {
		const configs = [{ engine: "chatgpt", provider: "direct", model: "gpt-5-mini", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ direct: configuredProvider })),
		).not.toThrow();
	});

	it("passes when openrouter provider has a model", () => {
		const configs = [{ engine: "chatgpt", provider: "openrouter", model: "openai/gpt-5-mini", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ openrouter: configuredProvider })),
		).not.toThrow();
	});

	it("does not require model for scraping providers", () => {
		const configs = [
			{ engine: "chatgpt", provider: "olostep", webSearch: true },
			{ engine: "chatgpt", provider: "brightdata", webSearch: true },
			{ engine: "google-ai-mode", provider: "dataforseo", webSearch: true },
		];
		expect(() =>
			validateScrapeTargets(
				configs,
				makeGetProvider({
					olostep: configuredProvider,
					brightdata: configuredProvider,
					dataforseo: configuredProvider,
				}),
			),
		).not.toThrow();
	});
});
