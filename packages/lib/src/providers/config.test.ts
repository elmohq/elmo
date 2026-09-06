import { describe, expect, it } from "vitest";
import { reportedWebQueries, validateScrapeTargets } from "./config";
import { brightdata } from "./registry/brightdata";
import { cloro } from "./registry/cloro";
import { dataforseo } from "./registry/dataforseo";
import { olostep } from "./registry/olostep";
import { oxylabs } from "./registry/oxylabs";
import type { ModelConfig } from "./types";

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
		expect(() => validateScrapeTargets(configs, makeGetProvider({ olostep: configuredProvider }))).not.toThrow();
	});

	it("throws on unknown provider", () => {
		const configs = [{ model: "chatgpt", provider: "nonexistent", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({}))).toThrow('unknown provider "nonexistent"');
	});

	it("throws when provider is not configured", () => {
		const configs = [{ model: "chatgpt", provider: "olostep", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({ olostep: unconfiguredProvider }))).toThrow(
			"requires API key",
		);
	});

	it("throws when openai-api provider has no version", () => {
		const configs = [{ model: "chatgpt", provider: "openai-api", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({ "openai-api": configuredProvider }))).toThrow(
			"requires a version slug",
		);
	});

	it("throws when anthropic-api provider has no version", () => {
		const configs = [{ model: "claude", provider: "anthropic-api", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({ "anthropic-api": configuredProvider }))).toThrow(
			"requires a version slug",
		);
	});

	it("throws when openrouter provider has no version", () => {
		const configs = [{ model: "chatgpt", provider: "openrouter", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({ openrouter: configuredProvider }))).toThrow(
			"requires a version slug",
		);
	});

	it("throws when mistral-api provider has no version", () => {
		const configs = [{ model: "mistral", provider: "mistral-api", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({ "mistral-api": configuredProvider }))).toThrow(
			"requires a version slug",
		);
	});

	it("passes when mistral-api provider has a version", () => {
		const configs = [{ model: "mistral", provider: "mistral-api", version: "mistral-medium-latest", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({ "mistral-api": configuredProvider }))).not.toThrow();
	});

	it("passes when openai-api provider has a version", () => {
		const configs = [{ model: "chatgpt", provider: "openai-api", version: "gpt-5-mini", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({ "openai-api": configuredProvider }))).not.toThrow();
	});

	it("passes when anthropic-api provider has a version", () => {
		const configs = [{ model: "claude", provider: "anthropic-api", version: "claude-sonnet-4", webSearch: true }];
		expect(() =>
			validateScrapeTargets(configs, makeGetProvider({ "anthropic-api": configuredProvider })),
		).not.toThrow();
	});

	it("passes when openrouter provider has a version", () => {
		const configs = [{ model: "chatgpt", provider: "openrouter", version: "openai/gpt-5-mini", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({ openrouter: configuredProvider }))).not.toThrow();
	});

	it("does not require version for scraping providers", () => {
		const configs = [
			{ model: "chatgpt", provider: "olostep", webSearch: true },
			{ model: "chatgpt", provider: "brightdata", webSearch: true },
			{ model: "chatgpt", provider: "oxylabs", webSearch: true },
			{ model: "chatgpt", provider: "cloro", webSearch: true },
			{ model: "google-ai-mode", provider: "dataforseo", webSearch: true },
		];
		expect(() =>
			validateScrapeTargets(
				configs,
				makeGetProvider({
					olostep: configuredProvider,
					brightdata: configuredProvider,
					oxylabs: configuredProvider,
					cloro: configuredProvider,
					dataforseo: configuredProvider,
				}),
			),
		).not.toThrow();
	});
});

describe("provider validateTarget", () => {
	function config(model: string, provider: string, webSearch: boolean, version?: string): ModelConfig {
		return { model, provider, version, webSearch };
	}

	describe("olostep", () => {
		it("accepts valid online targets", () => {
			for (const model of ["chatgpt", "google-ai-mode", "google-ai-overview", "gemini", "copilot", "perplexity"]) {
				expect(olostep.validateTarget!(config(model, "olostep", true))).toBeNull();
			}
		});

		it("rejects targets without :online", () => {
			expect(olostep.validateTarget!(config("chatgpt", "olostep", false))).toMatch(/requires :online/);
		});

		it("rejects unknown models", () => {
			expect(olostep.validateTarget!(config("unknown", "olostep", true))).toMatch(/does not support/);
		});
	});

	describe("brightdata", () => {
		it("accepts chatgpt with and without :online", () => {
			expect(brightdata.validateTarget!(config("chatgpt", "brightdata", true))).toBeNull();
			expect(brightdata.validateTarget!(config("chatgpt", "brightdata", false))).toBeNull();
		});

		it("accepts other models with :online", () => {
			for (const model of ["perplexity", "copilot", "gemini", "google-ai-mode"]) {
				expect(brightdata.validateTarget!(config(model, "brightdata", true))).toBeNull();
			}
		});

		it("rejects non-chatgpt models without :online", () => {
			expect(brightdata.validateTarget!(config("gemini", "brightdata", false))).toMatch(/requires :online/);
			expect(brightdata.validateTarget!(config("perplexity", "brightdata", false))).toMatch(/requires :online/);
		});

		it("rejects unknown models", () => {
			expect(brightdata.validateTarget!(config("unknown", "brightdata", true))).toMatch(/does not support/);
		});

		it("accepts unknown models with custom dataset ID", () => {
			expect(brightdata.validateTarget!(config("unknown", "brightdata", true, "gd_custom123"))).toBeNull();
		});
	});

	describe("dataforseo", () => {
		it("accepts google-ai-mode:online", () => {
			expect(dataforseo.validateTarget!(config("google-ai-mode", "dataforseo", true))).toBeNull();
		});

		it("rejects without :online", () => {
			expect(dataforseo.validateTarget!(config("google-ai-mode", "dataforseo", false))).toMatch(/requires :online/);
		});

		it("rejects unsupported models", () => {
			expect(dataforseo.validateTarget!(config("copilot", "dataforseo", true))).toMatch(/only supports/);
		});

		it("accepts chatgpt/perplexity/gemini with :online", () => {
			for (const model of ["chatgpt", "perplexity", "gemini"]) {
				expect(dataforseo.validateTarget!(config(model, "dataforseo", true))).toBeNull();
			}
		});

		it("accepts an explicit model_name via the version slug", () => {
			expect(dataforseo.validateTarget!(config("chatgpt", "dataforseo", true, "gpt-4.1"))).toBeNull();
		});

		it("rejects chatgpt/perplexity/gemini without :online", () => {
			expect(dataforseo.validateTarget!(config("chatgpt", "dataforseo", false))).toMatch(/requires :online/);
		});
	});

	describe("oxylabs", () => {
		it("accepts chatgpt with and without :online", () => {
			expect(oxylabs.validateTarget!(config("chatgpt", "oxylabs", true))).toBeNull();
			expect(oxylabs.validateTarget!(config("chatgpt", "oxylabs", false))).toBeNull();
		});

		it("accepts perplexity, google-ai-mode, and google-ai-overview with :online", () => {
			expect(oxylabs.validateTarget!(config("perplexity", "oxylabs", true))).toBeNull();
			expect(oxylabs.validateTarget!(config("google-ai-mode", "oxylabs", true))).toBeNull();
			expect(oxylabs.validateTarget!(config("google-ai-overview", "oxylabs", true))).toBeNull();
		});

		it("rejects perplexity / google-ai-mode / google-ai-overview without :online", () => {
			expect(oxylabs.validateTarget!(config("perplexity", "oxylabs", false))).toMatch(/requires :online/);
			expect(oxylabs.validateTarget!(config("google-ai-mode", "oxylabs", false))).toMatch(/requires :online/);
			expect(oxylabs.validateTarget!(config("google-ai-overview", "oxylabs", false))).toMatch(/requires :online/);
		});

		it("rejects unsupported models (e.g. copilot, gemini)", () => {
			expect(oxylabs.validateTarget!(config("copilot", "oxylabs", true))).toMatch(/does not support/);
			expect(oxylabs.validateTarget!(config("gemini", "oxylabs", true))).toMatch(/does not support/);
		});
	});

	describe("cloro", () => {
		it("accepts all supported surfaces with :online", () => {
			for (const model of ["chatgpt", "perplexity", "copilot", "gemini", "google-ai-mode", "google-ai-overview"]) {
				expect(cloro.validateTarget!(config(model, "cloro", true))).toBeNull();
			}
		});

		it("rejects targets without :online", () => {
			expect(cloro.validateTarget!(config("chatgpt", "cloro", false))).toMatch(/requires :online/);
			expect(cloro.validateTarget!(config("perplexity", "cloro", false))).toMatch(/requires :online/);
		});

		it("rejects unknown models", () => {
			expect(cloro.validateTarget!(config("grok", "cloro", true))).toMatch(/does not support/);
		});
	});
});

describe("reportedWebQueries", () => {
	it("reports nothing when web search was off", () => {
		expect(reportedWebQueries(["a"], { webSearch: false })).toEqual([]);
	});

	it("passes captured queries through", () => {
		expect(reportedWebQueries(["a", "b"])).toEqual(["a", "b"]);
	});

	it("marks a proven search with no captured query as unavailable", () => {
		expect(reportedWebQueries([])).toEqual(["unavailable"]);
		expect(reportedWebQueries([], { searchProven: false })).toEqual([]);
	});
});
