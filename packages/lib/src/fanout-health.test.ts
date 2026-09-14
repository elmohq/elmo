import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { FANOUT_HEALTH_MIN_RUNS, type FanoutRunCounts, findSilentFanoutTargets } from "./fanout-health";

const counts = (over: Partial<FanoutRunCounts> & Pick<FanoutRunCounts, "provider" | "model">): FanoutRunCounts => ({
	runs: FANOUT_HEALTH_MIN_RUNS,
	runsWithQueries: 0,
	...over,
});

const exposes = (config: { provider: string }) => config.provider !== "dataforseo";

describe("findSilentFanoutTargets", () => {
	it("flags a target that reported no queries across the whole window", () => {
		const silent = findSilentFanoutTargets(
			parseScrapeTargets("chatgpt:openai-api:gpt-5-mini:online"),
			[counts({ provider: "openai-api", model: "chatgpt" })],
			exposes,
		);

		expect(silent).toEqual([
			{ target: "chatgpt:openai-api:gpt-5-mini:online", provider: "openai-api", model: "chatgpt", runs: 50 },
		]);
	});

	it("stays quiet while the target still reports the occasional query", () => {
		const silent = findSilentFanoutTargets(
			parseScrapeTargets("chatgpt:openai-api:gpt-5-mini:online"),
			[counts({ provider: "openai-api", model: "chatgpt", runs: 500, runsWithQueries: 1 })],
			exposes,
		);

		expect(silent).toEqual([]);
	});

	it("stays quiet for a provider that exposes no queries by design", () => {
		const silent = findSilentFanoutTargets(
			parseScrapeTargets("google-ai-mode:dataforseo:online"),
			[counts({ provider: "dataforseo", model: "google-ai-mode", runs: 5000 })],
			exposes,
		);

		expect(silent).toEqual([]);
	});

	it("stays quiet for targets running without web search", () => {
		const silent = findSilentFanoutTargets(
			parseScrapeTargets("claude:anthropic-api:claude-sonnet-5"),
			[counts({ provider: "anthropic-api", model: "claude", runs: 5000 })],
			exposes,
		);

		expect(silent).toEqual([]);
	});

	it("stays quiet below the minimum sample", () => {
		const silent = findSilentFanoutTargets(
			parseScrapeTargets("chatgpt:openai-api:gpt-5-mini:online"),
			[counts({ provider: "openai-api", model: "chatgpt", runs: FANOUT_HEALTH_MIN_RUNS - 1 })],
			exposes,
		);

		expect(silent).toEqual([]);
	});

	it("stays quiet for a configured target that has not run at all", () => {
		const silent = findSilentFanoutTargets(parseScrapeTargets("chatgpt:openai-api:gpt-5-mini:online"), [], exposes);

		expect(silent).toEqual([]);
	});

	it("reports each broken target separately so they alert separately", () => {
		const silent = findSilentFanoutTargets(
			parseScrapeTargets("chatgpt:openai-api:gpt-5-mini:online,chatgpt:brightdata:online,perplexity:cloro:online"),
			[
				counts({ provider: "openai-api", model: "chatgpt" }),
				counts({ provider: "brightdata", model: "chatgpt", runsWithQueries: 40 }),
				counts({ provider: "cloro", model: "perplexity" }),
			],
			exposes,
		);

		expect(silent.map((s) => s.target)).toEqual(["chatgpt:openai-api:gpt-5-mini:online", "perplexity:cloro:online"]);
	});
});
