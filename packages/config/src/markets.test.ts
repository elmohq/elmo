import { describe, expect, it } from "vitest";
import {
	COUNTRIES,
	DEFAULT_MARKET,
	googleGeotargetId,
	googleLanguageCode,
	LANGUAGES,
	MARKETS,
	marketId,
	parseMarketFilter,
	parseMarketId,
	resolveMarket,
} from "./markets";

describe("market lists", () => {
	it("offers every country in English and in each of its own listed languages", () => {
		const languages = new Set(LANGUAGES.map((language) => language.code));
		for (const country of COUNTRIES) {
			const offered = MARKETS.filter((market) => market.country === country.code).map((market) => market.language);
			expect(offered, country.code).toContain("en");
			for (const language of offered) expect(languages.has(language), `${country.code} ${language}`).toBe(true);
		}
	});

	it("lists no country or language twice", () => {
		expect(new Set(COUNTRIES.map((country) => country.code)).size).toBe(COUNTRIES.length);
		expect(new Set(LANGUAGES.map((language) => language.code)).size).toBe(LANGUAGES.length);
		expect(new Set(MARKETS.map(marketId)).size).toBe(MARKETS.length);
	});

	it("includes the default market", () => {
		expect(MARKETS).toContainEqual(DEFAULT_MARKET);
	});
});

describe("market ids", () => {
	it("round-trips a market through its locale-style id", () => {
		for (const market of MARKETS) expect(parseMarketId(marketId(market))).toEqual(market);
		expect(marketId({ country: "CH", language: "fr" })).toBe("fr-CH");
	});

	it("accepts either case and rejects anything outside the lists", () => {
		expect(parseMarketId("DE-de")).toEqual({ country: "DE", language: "de" });
		expect(parseMarketId("xx-US")).toBeNull();
		expect(parseMarketId("en-ZZ")).toBeNull();
		expect(parseMarketId("en")).toBeNull();
	});

	it("drops unknown and repeated ids from a filter", () => {
		expect(parseMarketFilter("en-US,nope,de-DE,en-us")).toEqual([
			{ country: "US", language: "en" },
			{ country: "DE", language: "de" },
		]);
		expect(parseMarketFilter(undefined)).toEqual([]);
	});
});

describe("resolveMarket", () => {
	const brand = { country: "FR", language: "fr" };

	it("uses the brand's market for a prompt that sets none", () => {
		expect(resolveMarket({ country: null, language: null }, brand)).toEqual(brand);
	});

	it("lets a prompt override the country, the language, or both", () => {
		expect(resolveMarket({ country: "CA", language: null }, brand)).toEqual({ country: "CA", language: "fr" });
		expect(resolveMarket({ country: null, language: "en" }, brand)).toEqual({ country: "FR", language: "en" });
		expect(resolveMarket({ country: "DE", language: "de" }, brand)).toEqual({ country: "DE", language: "de" });
	});
});

describe("provider codes", () => {
	it("builds Google geotarget ids from ISO numeric codes", () => {
		expect(googleGeotargetId("US")).toBe(2840);
		expect(googleGeotargetId("GB")).toBe(2826);
		expect(googleGeotargetId("TW")).toBe(2158);
	});

	it("writes languages the way Google's hl expects", () => {
		expect(googleLanguageCode({ country: "DE", language: "de" })).toBe("de");
		expect(googleLanguageCode({ country: "IL", language: "he" })).toBe("iw");
		expect(googleLanguageCode({ country: "BR", language: "pt" })).toBe("pt-BR");
		expect(googleLanguageCode({ country: "PT", language: "pt" })).toBe("pt-PT");
		expect(googleLanguageCode({ country: "TW", language: "zh" })).toBe("zh-TW");
		expect(googleLanguageCode({ country: "SG", language: "zh" })).toBe("zh-CN");
	});
});
