import type { MarketSupport, MarketTarget } from "@/lib/market-support";

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

/** Self-hosted: every target is priced, and one of them can't be told a country. */
export const selfHostedMarketSupport: MarketSupport = {
	brandMarket: { country: "US", language: "en" },
	countriesInUse: ["US", "DE"],
	targets: [
		target("chatgpt"),
		target("google-ai-mode", { costPerRunUsd: 0.005, sendsLanguage: true }),
		target("claude", { locationFree: true }),
		target("perplexity", { defaultLocationCountries: ["DE", "FR", "JP"], costPerRunUsd: 0.005 }),
	],
	promptAllowance: null,
};

/** Cloud: no prices, and prompts come out of the plan's allowance. */
export const planMarketSupport: MarketSupport = {
	brandMarket: { country: "US", language: "en" },
	countriesInUse: ["US", "DE"],
	targets: selfHostedMarketSupport.targets.map((entry) => ({ ...entry, costPerRunUsd: null })),
	promptAllowance: { used: 42, max: 100 },
};
