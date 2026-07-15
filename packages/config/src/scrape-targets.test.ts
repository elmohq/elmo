import { describe, expect, it } from "vitest";
import { formatScrapeTarget, type ModelConfig, parseScrapeTargets } from "./scrape-targets";

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
				version: "anthropic/claude-sonnet-4.6",
				webSearch: true,
			}),
		).toBe("claude:openrouter:anthropic/claude-sonnet-4.6:online");
	});

	it("formats replication and cadence in canonical order", () => {
		expect(
			formatScrapeTarget({
				model: "claude",
				provider: "anthropic-api",
				version: "claude-sonnet-4-6",
				webSearch: true,
				replication: 1,
				cadenceHours: 24,
			}),
		).toBe("claude:anthropic-api:claude-sonnet-4-6:online:x1:24h");
	});
});

describe("parseScrapeTargets replication and cadence options", () => {
	it("parses :xN after :online", () => {
		expect(parseScrapeTargets("chatgpt:olostep:online:x4")).toEqual([
			{ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true, replication: 4 },
		]);
	});

	it("parses :xN and :Nh with a version and no web search", () => {
		expect(parseScrapeTargets("claude:anthropic-api:claude-sonnet-4-6:x1:24h")).toEqual([
			{
				model: "claude",
				provider: "anthropic-api",
				version: "claude-sonnet-4-6",
				webSearch: false,
				replication: 1,
				cadenceHours: 24,
			},
		]);
	});

	it("parses all three tail options with a version", () => {
		expect(parseScrapeTargets("claude:anthropic-api:claude-sonnet-4-6:online:x1:24h")).toEqual([
			{
				model: "claude",
				provider: "anthropic-api",
				version: "claude-sonnet-4-6",
				webSearch: true,
				replication: 1,
				cadenceHours: 24,
			},
		]);
	});

	it("accepts tail options in any order", () => {
		expect(parseScrapeTargets("claude:anthropic-api:claude-sonnet-4-6:24h:x1:online")).toEqual(
			parseScrapeTargets("claude:anthropic-api:claude-sonnet-4-6:online:x1:24h"),
		);
	});

	it("keeps the colon in OpenRouter variant slugs", () => {
		expect(parseScrapeTargets("chatgpt:openrouter:openai/gpt-5-mini:free:online:x2:12h")).toEqual([
			{
				model: "chatgpt",
				provider: "openrouter",
				version: "openai/gpt-5-mini:free",
				webSearch: true,
				replication: 2,
				cadenceHours: 12,
			},
		]);
	});

	it("rejects x0", () => {
		expect(() => parseScrapeTargets("chatgpt:olostep:x0")).toThrow(/replication must be >= 1/);
	});

	it("rejects 0h", () => {
		expect(() => parseScrapeTargets("chatgpt:olostep:0h")).toThrow(/cadence must be >= 1 hour/);
	});

	it("rejects duplicate options of the same kind", () => {
		expect(() => parseScrapeTargets("chatgpt:olostep:x2:x3")).toThrow(/duplicate replication option/);
		expect(() => parseScrapeTargets("chatgpt:olostep:12h:24h")).toThrow(/duplicate cadence option/);
		expect(() => parseScrapeTargets("chatgpt:olostep:online:online")).toThrow(/duplicate online option/);
	});
});

describe("round-trip", () => {
	it("parse(format(x)) returns x", () => {
		const configs: ModelConfig[] = [
			{ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true },
			{ model: "chatgpt", provider: "brightdata", version: undefined, webSearch: false },
			{ model: "claude", provider: "anthropic-api", version: "claude-sonnet-4-6", webSearch: true },
			{ model: "chatgpt", provider: "openai-api", version: "gpt-5-mini", webSearch: false },
			{ model: "chatgpt", provider: "openrouter", version: "openai/gpt-5-mini:free", webSearch: true },
			{ model: "google-ai-mode", provider: "dataforseo", version: undefined, webSearch: true },
			{ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true, replication: 4 },
			{ model: "claude", provider: "anthropic-api", version: "claude-sonnet-4-6", webSearch: false, cadenceHours: 24 },
			{
				model: "chatgpt",
				provider: "openrouter",
				version: "openai/gpt-5-mini:free",
				webSearch: true,
				replication: 2,
				cadenceHours: 12,
			},
		];
		for (const config of configs) {
			expect(parseScrapeTargets(formatScrapeTarget(config))).toEqual([config]);
		}
	});

	it("format(parse(s)) returns s", () => {
		const value =
			"chatgpt:olostep:online,claude:openrouter:anthropic/claude-sonnet-4.6,mistral:mistral-api:mistral-medium-latest:online,chatgpt:brightdata,claude:anthropic-api:claude-sonnet-4-6:online:x1:24h";
		expect(parseScrapeTargets(value).map(formatScrapeTarget).join(",")).toBe(value);
	});
});
