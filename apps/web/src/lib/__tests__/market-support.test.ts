import { describe, expect, it } from "vitest";
import {
	type MarketSupport,
	type MarketTarget,
	promptCostIn,
	targetStatusIn,
	targetsRunningIn,
} from "../market-support";

const target = (value: string, overrides: Partial<MarketTarget> = {}): MarketTarget => ({
	value,
	runsPerDay: 1,
	replication: 1,
	unsupportedCountries: [],
	locationFree: false,
	costPerRunUsd: 0.01,
	...overrides,
});

const support = (targets: MarketTarget[]): MarketSupport => ({
	brandMarket: { country: "US", language: "en" },
	targets,
	promptAllowance: null,
});

describe("targetStatusIn", () => {
	it("skips a target in a country it can't answer from, and only there", () => {
		const perplexity = target("perplexity", { unsupportedCountries: ["DE"] });
		expect(targetStatusIn(perplexity, "DE")).toBe("skipped");
		expect(targetStatusIn(perplexity, "US")).toBe("localized");
	});

	it("runs a model with no location everywhere", () => {
		expect(targetStatusIn(target("claude", { locationFree: true }), "JP")).toBe("location-free");
	});
});

describe("promptCostIn", () => {
	it("prices a prompt as every running target's calls for a month", () => {
		const cost = promptCostIn(
			support([target("chatgpt", { runsPerDay: 2, replication: 3 }), target("gemini", { costPerRunUsd: 0.005 })]),
			"US",
		);
		expect(cost.callsPerDay).toBe(7);
		expect(cost.monthlyUsd).toBeCloseTo(0.01 * 6 * 30 + 0.005 * 30);
	});

	it("leaves out a target that skips the country, so a market fewer models cover costs less", () => {
		const both = support([target("chatgpt"), target("perplexity", { unsupportedCountries: ["DE"] })]);
		expect(targetsRunningIn(both, "DE").map((entry) => entry.value)).toEqual(["chatgpt"]);
		expect(promptCostIn(both, "DE").callsPerDay).toBe(1);
		expect(promptCostIn(both, "US").callsPerDay).toBe(2);
	});

	it("gives no dollar figure where targets carry no price", () => {
		const cost = promptCostIn(support([target("chatgpt", { costPerRunUsd: null })]), "US");
		expect(cost).toEqual({ callsPerDay: 1, monthlyUsd: null });
	});
});
