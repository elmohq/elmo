import { DEFAULT_MARKET } from "@workspace/config/markets";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { describeMarketHandling, marketToSend, sentMarket } from "./index";

const target = (spec: string) => parseScrapeTargets(spec)[0];
const germany = { country: "DE", language: "de" };

describe("describeMarketHandling", () => {
	it("says when a target can be told the country", () => {
		expect(describeMarketHandling(target("chatgpt:cloro:online"), germany)).toEqual({
			country: "localized",
			sendsLanguage: false,
		});
	});

	it("reports the language as sent only on surfaces that take one", () => {
		expect(describeMarketHandling(target("google-ai-mode:cloro:online"), germany).sendsLanguage).toBe(true);
		expect(describeMarketHandling(target("google-ai-overview:dataforseo:online"), germany).sendsLanguage).toBe(true);
	});

	it("runs a model called without web search anywhere, since its answer has no location", () => {
		expect(describeMarketHandling(target("claude:anthropic-api:claude-sonnet-5"), germany)).toEqual({
			country: "location-free",
			sendsLanguage: false,
		});
	});

	it("localizes a model's own web search when its API takes a location", () => {
		expect(describeMarketHandling(target("claude:anthropic-api:claude-sonnet-5:online"), germany).country).toBe(
			"localized",
		);
		expect(describeMarketHandling(target("chatgpt:openai-api:gpt-5-mini:online"), germany).country).toBe("localized");
	});

	it("still runs a target that can't be told the country, on its provider's default", () => {
		const grounded = target("perplexity:openrouter:perplexity/sonar:online");
		expect(describeMarketHandling(grounded, germany)).toEqual({ country: "provider-default", sendsLanguage: false });
		expect(marketToSend(grounded, germany).country).toBe(DEFAULT_MARKET.country);
	});

	it("falls back only for the countries a provider's surface leaves out", () => {
		const bing = target("bing-ai-mode:cloro:online");
		expect(marketToSend(bing, { country: "KR", language: "ko" }).country).toBe(DEFAULT_MARKET.country);
		expect(marketToSend(bing, { country: "JP", language: "ja" }).country).toBe("JP");
	});

	it("does not vouch for a BrightData collector named by a custom dataset id", () => {
		expect(describeMarketHandling(target("chatgpt:brightdata:online"), germany).country).toBe("localized");
		expect(describeMarketHandling(target("chatgpt:brightdata:gd_custom123:online"), germany).country).toBe(
			"provider-default",
		);
	});
});

describe("sentMarket", () => {
	it("records only the half of the market the provider was given", () => {
		expect(sentMarket(target("google-ai-mode:searchapi:online"), germany)).toEqual({ country: "DE", language: "de" });
		expect(sentMarket(target("chatgpt:searchapi:online"), germany)).toEqual({ country: "DE", language: null });
		expect(sentMarket(target("claude:anthropic-api:claude-sonnet-5"), germany)).toEqual({
			country: null,
			language: null,
		});
	});

	it("claims no country for a provider answering from its own default", () => {
		expect(sentMarket(target("bing-ai-mode:searchapi:online"), DEFAULT_MARKET)).toEqual({
			country: null,
			language: null,
		});
	});
});
