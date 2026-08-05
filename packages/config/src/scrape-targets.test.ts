import { describe, expect, it } from "vitest";
import { formatScrapeTarget, getTrackingTargetKey, type ModelConfig, parseScrapeTargets } from "./scrape-targets";

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

	it("formats a stable target key independently from the provider model", () => {
		expect(
			formatScrapeTarget({
				targetKey: "claude-native-web",
				model: "claude",
				provider: "anthropic-api",
				version: "claude-sonnet-4-6",
				webSearch: true,
			}),
		).toBe("claude-native-web=claude:anthropic-api:claude-sonnet-4-6:online");
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
			{
				targetKey: "claude-native-web",
				model: "claude",
				provider: "anthropic-api",
				version: "claude-sonnet-4-6",
				webSearch: true,
			},
		];
		for (const config of configs) {
			expect(parseScrapeTargets(formatScrapeTarget(config))).toEqual([config]);
		}
	});

	it("format(parse(s)) returns s", () => {
		const value =
			"chatgpt:olostep:online,claude:openrouter:anthropic/claude-sonnet-4.6,mistral:mistral-api:mistral-medium-latest:online,chatgpt:brightdata";
		expect(parseScrapeTargets(value).map(formatScrapeTarget).join(",")).toBe(value);
	});
});

describe("getTrackingTargetKey", () => {
	it("uses the explicit stable key when present", () => {
		expect(
			getTrackingTargetKey({ targetKey: "chatgpt-web", model: "chatgpt", provider: "stub", webSearch: true }),
		).toBe("chatgpt-web");
	});

	it("keeps legacy entries addressable by model", () => {
		expect(getTrackingTargetKey({ model: "chatgpt", provider: "stub", webSearch: true })).toBe("chatgpt");
	});
});
