import type { MarketSupport, MarketTarget } from "@/lib/market-support";

const target = (value: string, overrides: Partial<MarketTarget> = {}): MarketTarget => ({
	value,
	runsPerDay: 1,
	replication: 1,
	unsupportedCountries: [],
	locationFree: false,
	sendsLanguage: false,
	costPerRunUsd: 0.01,
	...overrides,
});

/** Self-hosted: every target is priced, and one of them can only answer from the default market. */
export const selfHostedMarketSupport: MarketSupport = {
	brandMarket: { country: "US", language: "en" },
	targets: [
		target("chatgpt"),
		target("google-ai-mode", { sendsLanguage: true, costPerRunUsd: 0.005 }),
		target("claude", { locationFree: true }),
		target("perplexity", { unsupportedCountries: ["DE", "FR", "JP", "BR", "GB"], costPerRunUsd: 0.005 }),
	],
	promptAllowance: null,
};

/** Cloud: no prices, and prompts come out of the plan's allowance. */
export const planMarketSupport: MarketSupport = {
	brandMarket: { country: "US", language: "en" },
	targets: selfHostedMarketSupport.targets.map((entry) => ({ ...entry, costPerRunUsd: null })),
	promptAllowance: { used: 42, max: 100 },
};
