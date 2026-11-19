import { describe, expect, it } from "vitest";
import {
	COUNTRIES,
	countryFilterSchema,
	DEFAULT_MARKET,
	googleGeotargetId,
	googleLanguageCode,
	LANGUAGES,
	languageFilterSchema,
	MARKETS,
	marketId,
	parseCountryFilter,
	parseLanguageFilter,
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

describe("country and language filters", () => {
	it("reads codes from a link in either case, dropping unknown and repeated ones", () => {
		expect(parseCountryFilter("de,US,zz,DE")).toEqual(["DE", "US"]);
		expect(parseLanguageFilter("EN,xx,de")).toEqual(["en", "de"]);
		expect(parseCountryFilter(undefined)).toEqual([]);
	});

	it("accepts a list of known codes from an API caller", () => {
		expect(countryFilterSchema.safeParse("DE,ch").success).toBe(true);
		expect(languageFilterSchema.safeParse("de,fr").success).toBe(true);
		expect(countryFilterSchema.safeParse("").success).toBe(true);
	});

	it("names the code it can't read rather than ignoring it", () => {
		const country = countryFilterSchema.safeParse("DE,Germany");
		expect(country.success).toBe(false);
		expect(country.error?.issues[0]?.message).toContain('"Germany"');
		expect(languageFilterSchema.safeParse("de,xx").success).toBe(false);
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
