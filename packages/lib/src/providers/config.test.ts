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
		it("parses model:provider", () => {
			const result = parseScrapeTargets("chatgpt:olostep");
			expect(result).toEqual([
				{ model: "chatgpt", provider: "olostep", version: undefined, webSearch: false },
			]);
		});

		it("parses model:provider:online", () => {
			const result = parseScrapeTargets("chatgpt:olostep:online");
			expect(result).toEqual([
				{ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true },
			]);
		});

		it("parses model:provider:version", () => {
			const result = parseScrapeTargets("chatgpt:direct:gpt-5-mini");
			expect(result).toEqual([
				{ model: "chatgpt", provider: "direct", version: "gpt-5-mini", webSearch: false },
			]);
		});

		it("parses model:provider:version:online", () => {
			const result = parseScrapeTargets("chatgpt:direct:gpt-5-mini:online");
			expect(result).toEqual([
				{ model: "chatgpt", provider: "direct", version: "gpt-5-mini", webSearch: true },
			]);
		});
	});

	describe("multiple entries", () => {
		it("parses comma-separated entries", () => {
			const result = parseScrapeTargets(
				"chatgpt:olostep:online,google-ai-mode:olostep:online,copilot:olostep:online",
			);
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true });
			expect(result[1]).toEqual({ model: "google-ai-mode", provider: "olostep", version: undefined, webSearch: true });
			expect(result[2]).toEqual({ model: "copilot", provider: "olostep", version: undefined, webSearch: true });
		});

		it("handles mixed providers", () => {
			const result = parseScrapeTargets(
				"chatgpt:olostep:online,claude:openrouter:anthropic/claude-sonnet-4,google-ai-mode:dataforseo:online",
			);
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true });
			expect(result[1]).toEqual({ model: "claude", provider: "openrouter", version: "anthropic/claude-sonnet-4", webSearch: false });
			expect(result[2]).toEqual({ model: "google-ai-mode", provider: "dataforseo", version: undefined, webSearch: true });
		});
	});

	describe("OpenRouter version slugs with colons", () => {
		it("handles :free variant suffix without web search", () => {
			const result = parseScrapeTargets("chatgpt:openrouter:openai/gpt-5-mini:free");
			expect(result).toEqual([
				{ model: "chatgpt", provider: "openrouter", version: "openai/gpt-5-mini:free", webSearch: false },
			]);
		});

		it("handles :free variant suffix with web search", () => {
			const result = parseScrapeTargets("chatgpt:openrouter:openai/gpt-5-mini:free:online");
			expect(result).toEqual([
				{ model: "chatgpt", provider: "openrouter", version: "openai/gpt-5-mini:free", webSearch: true },
			]);
		});

		it("handles complex version slug with multiple colon-separated parts", () => {
			const result = parseScrapeTargets("qwen:openrouter:qwen/qwen3.6-plus:free:online");
			expect(result).toEqual([
				{ model: "qwen", provider: "openrouter", version: "qwen/qwen3.6-plus:free", webSearch: true },
			]);
		});
	});

	describe("custom/unknown models", () => {
		it("accepts any model name", () => {
			const result = parseScrapeTargets("deepseek:openrouter:deepseek/deepseek-v3:online");
			expect(result).toEqual([
				{ model: "deepseek", provider: "openrouter", version: "deepseek/deepseek-v3", webSearch: true },
			]);
		});

		it("accepts model names with hyphens", () => {
			const result = parseScrapeTargets("my-custom-model:brightdata:online");
			expect(result).toEqual([
				{ model: "my-custom-model", provider: "brightdata", version: undefined, webSearch: true },
			]);
		});
	});

	describe("whitespace handling", () => {
		it("trims whitespace around entries", () => {
			const result = parseScrapeTargets(" chatgpt:olostep:online , google-ai-mode:olostep:online ");
			expect(result).toHaveLength(2);
			expect(result[0].model).toBe("chatgpt");
			expect(result[1].model).toBe("google-ai-mode");
		});
	});

	describe("error cases", () => {
		it("throws on empty string entries (trailing comma)", () => {
			expect(() => parseScrapeTargets("chatgpt:olostep,")).toThrow("empty entry");
		});

		it("throws on single-segment entries", () => {
			expect(() => parseScrapeTargets("chatgpt")).toThrow("need at least model:provider");
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
			{ model: "chatgpt", provider: "olostep", webSearch: true },
			{ model: "google-ai-mode", provider: "olostep", webSearch: true },
		];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ olostep: configuredProvider })),
		).not.toThrow();
	});

	it("throws on unknown provider", () => {
		const configs = [{ model: "chatgpt", provider: "nonexistent", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({}))).toThrow('unknown provider "nonexistent"');
	});

	it("throws when provider is not configured", () => {
		const configs = [{ model: "chatgpt", provider: "olostep", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ olostep: unconfiguredProvider })),
		).toThrow("requires API key");
	});

	it("throws when direct provider has no version", () => {
		const configs = [{ model: "chatgpt", provider: "direct", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ direct: configuredProvider })),
		).toThrow("requires a version slug");
	});

	it("throws when openrouter provider has no version", () => {
		const configs = [{ model: "chatgpt", provider: "openrouter", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ openrouter: configuredProvider })),
		).toThrow("requires a version slug");
	});

	it("passes when direct provider has a version", () => {
		const configs = [{ model: "chatgpt", provider: "direct", version: "gpt-5-mini", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ direct: configuredProvider })),
		).not.toThrow();
	});

	it("passes when openrouter provider has a version", () => {
		const configs = [{ model: "chatgpt", provider: "openrouter", version: "openai/gpt-5-mini", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ openrouter: configuredProvider })),
		).not.toThrow();
	});

	it("does not require version for scraping providers", () => {
		const configs = [
			{ model: "chatgpt", provider: "olostep", webSearch: true },
			{ model: "chatgpt", provider: "brightdata", webSearch: true },
			{ model: "google-ai-mode", provider: "dataforseo", webSearch: true },
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
