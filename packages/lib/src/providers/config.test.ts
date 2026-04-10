import { describe, it, expect } from "vitest";
import { parseScrapeTargets, validateScrapeTargets } from "./config";

describe("parseScrapeTargets", () => {
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
			const result = parseScrapeTargets("chatgpt:openai-api:gpt-5-mini");
			expect(result).toEqual([
				{ model: "chatgpt", provider: "openai-api", version: "gpt-5-mini", webSearch: false },
			]);
		});

		it("parses model:provider:version:online", () => {
			const result = parseScrapeTargets("chatgpt:openai-api:gpt-5-mini:online");
			expect(result).toEqual([
				{ model: "chatgpt", provider: "openai-api", version: "gpt-5-mini", webSearch: true },
			]);
		});
	});

	it("parses multiple entries with mixed providers", () => {
		const result = parseScrapeTargets(
			"chatgpt:olostep:online,claude:openrouter:anthropic/claude-sonnet-4,google-ai-mode:dataforseo:online",
		);
		expect(result).toHaveLength(3);
		expect(result[0]).toEqual({ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true });
		expect(result[1]).toEqual({ model: "claude", provider: "openrouter", version: "anthropic/claude-sonnet-4", webSearch: false });
		expect(result[2]).toEqual({ model: "google-ai-mode", provider: "dataforseo", version: undefined, webSearch: true });
	});

	it("handles OpenRouter version slugs with colons", () => {
		const result = parseScrapeTargets("chatgpt:openrouter:openai/gpt-5-mini:free:online");
		expect(result).toEqual([
			{ model: "chatgpt", provider: "openrouter", version: "openai/gpt-5-mini:free", webSearch: true },
		]);
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

	it("throws when openai-api provider has no version", () => {
		const configs = [{ model: "chatgpt", provider: "openai-api", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ "openai-api": configuredProvider })),
		).toThrow("requires a version slug");
	});

	it("throws when anthropic-api provider has no version", () => {
		const configs = [{ model: "claude", provider: "anthropic-api", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ "anthropic-api": configuredProvider })),
		).toThrow("requires a version slug");
	});

	it("throws when openrouter provider has no version", () => {
		const configs = [{ model: "chatgpt", provider: "openrouter", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ openrouter: configuredProvider })),
		).toThrow("requires a version slug");
	});

	it("passes when openai-api provider has a version", () => {
		const configs = [{ model: "chatgpt", provider: "openai-api", version: "gpt-5-mini", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ "openai-api": configuredProvider })),
		).not.toThrow();
	});

	it("passes when anthropic-api provider has a version", () => {
		const configs = [{ model: "claude", provider: "anthropic-api", version: "claude-sonnet-4", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ "anthropic-api": configuredProvider })),
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
