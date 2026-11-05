import { describe, expect, it } from "vitest";
import {
	formatScrapeTarget,
	type ModelConfig,
	parseScrapeTargets,
	providersByModel,
	STATUS_TARGETS,
} from "./scrape-targets";

describe("parseScrapeTargets", () => {
	describe("basic parsing", () => {
		it("parses model:provider", () => {
			const result = parseScrapeTargets("chatgpt:olostep");
			expect(result).toEqual([{ model: "chatgpt", provider: "olostep", version: undefined, webSearch: false }]);
		});

		it("parses model:provider:online", () => {
			const result = parseScrapeTargets("chatgpt:olostep:online");
			expect(result).toEqual([{ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true }]);
		});

		it("parses model:provider:version", () => {
			const result = parseScrapeTargets("chatgpt:openai-api:gpt-5-mini");
			expect(result).toEqual([{ model: "chatgpt", provider: "openai-api", version: "gpt-5-mini", webSearch: false }]);
		});

		it("parses model:provider:version:online", () => {
			const result = parseScrapeTargets("chatgpt:openai-api:gpt-5-mini:online");
			expect(result).toEqual([{ model: "chatgpt", provider: "openai-api", version: "gpt-5-mini", webSearch: true }]);
		});
	});

	it("parses multiple entries with mixed providers", () => {
		const result = parseScrapeTargets(
			"chatgpt:olostep:online,claude:openrouter:anthropic/claude-sonnet-4,google-ai-mode:dataforseo:online",
		);
		expect(result).toHaveLength(3);
		expect(result[0]).toEqual({ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true });
		expect(result[1]).toEqual({
			model: "claude",
			provider: "openrouter",
			version: "anthropic/claude-sonnet-4",
			webSearch: false,
		});
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

describe("formatScrapeTarget", () => {
	it("formats model:provider", () => {
		expect(formatScrapeTarget({ model: "chatgpt", provider: "brightdata", webSearch: false })).toBe(
			"chatgpt:brightdata",
		);
	});

	it("formats model:provider:online", () => {
		expect(formatScrapeTarget({ model: "chatgpt", provider: "olostep", webSearch: true })).toBe(
			"chatgpt:olostep:online",
		);
	});

	it("formats model:provider:version", () => {
		expect(
			formatScrapeTarget({ model: "chatgpt", provider: "openai-api", version: "gpt-5-mini", webSearch: false }),
		).toBe("chatgpt:openai-api:gpt-5-mini");
	});

	it("formats model:provider:version:online", () => {
		expect(
			formatScrapeTarget({
				model: "claude",
				provider: "openrouter",
				version: "anthropic/claude-sonnet-5",
				webSearch: true,
			}),
		).toBe("claude:openrouter:anthropic/claude-sonnet-5:online");
	});
});

describe("round-trip", () => {
	it("parse(format(x)) returns x", () => {
		const configs: ModelConfig[] = [
			{ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true },
			{ model: "chatgpt", provider: "brightdata", version: undefined, webSearch: false },
			{ model: "claude", provider: "anthropic-api", version: "claude-sonnet-5", webSearch: true },
			{ model: "chatgpt", provider: "openai-api", version: "gpt-5-mini", webSearch: false },
			{ model: "chatgpt", provider: "openrouter", version: "openai/gpt-5-mini:free", webSearch: true },
			{ model: "google-ai-mode", provider: "dataforseo", version: undefined, webSearch: true },
		];
		for (const config of configs) {
			expect(parseScrapeTargets(formatScrapeTarget(config))).toEqual([config]);
		}
	});

	it("format(parse(s)) returns s", () => {
		const value =
			"chatgpt:olostep:online,claude:openrouter:anthropic/claude-sonnet-5,mistral:mistral-api:mistral-medium-latest:online,chatgpt:brightdata";
		expect(parseScrapeTargets(value).map(formatScrapeTarget).join(",")).toBe(value);
	});
});

describe("providersByModel", () => {
	it("lists every provider STATUS_TARGETS exercises for a model, deduped and sorted", () => {
		const map = providersByModel();
		// ChatGPT is the most widely served surface, via scrapers and APIs alike.
		const chatgpt = map.get("chatgpt") ?? [];
		expect(chatgpt).toContain("brightdata");
		expect(chatgpt).toContain("openai-api");
		expect(chatgpt).toEqual([...new Set(chatgpt)].sort());
	});

	it("covers every model STATUS_TARGETS names, and nothing else", () => {
		const fromTargets = new Set(parseScrapeTargets(STATUS_TARGETS.join(",")).map((t) => t.model));
		expect(new Set(providersByModel().keys())).toEqual(fromTargets);
	});
});
