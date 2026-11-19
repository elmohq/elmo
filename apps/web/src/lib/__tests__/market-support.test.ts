import { describe, expect, it } from "vitest";
import { type MarketSupport, type MarketTarget, promptCost } from "../market-support";

const target = (value: string, overrides: Partial<MarketTarget> = {}): MarketTarget => ({
	value,
	runsPerDay: 1,
	replication: 1,
	locationFree: false,
	defaultLocationCountries: [],
	sendsLanguage: false,
	costPerRunUsd: 0.01,
	...overrides,
});

const support = (targets: MarketTarget[]): MarketSupport => ({
	brandMarket: { country: "US", language: "en" },
	targets,
	promptAllowance: null,
});

describe("promptCost", () => {
	it("prices a prompt as every tracked model's calls for a month", () => {
		const cost = promptCost(
			support([target("chatgpt", { runsPerDay: 2, replication: 3 }), target("gemini", { costPerRunUsd: 0.005 })]),
		);
		expect(cost.callsPerDay).toBe(7);
		expect(cost.monthlyUsd).toBeCloseTo(0.01 * 6 * 30 + 0.005 * 30);
	});

	it("counts a model whose provider can't be told the country, since it still runs", () => {
		const cost = promptCost(support([target("chatgpt"), target("perplexity", { defaultLocationCountries: ["DE"] })]));
		expect(cost.callsPerDay).toBe(2);
	});

	it("gives no dollar figure where targets carry no price", () => {
		expect(promptCost(support([target("chatgpt", { costPerRunUsd: null })]))).toEqual({
			callsPerDay: 1,
			monthlyUsd: null,
		});
	});
});
