import { describe, expect, it } from "vitest";
import { normalizeCountryCode } from "./countries";
import { normalizeLanguageCode } from "./languages";
import { MARKETS, marketName } from "./markets";

describe("markets", () => {
	it("offers every country in its own language and in English", () => {
		const swiss = MARKETS.filter((m) => m.country === "CH").map(marketName);
		expect(swiss).toEqual([
			"Switzerland (German)",
			"Switzerland (French)",
			"Switzerland (Italian)",
			"Switzerland (English)",
		]);
	});

	it("only pairs countries and languages the rest of the app accepts", () => {
		for (const market of MARKETS) {
			expect(normalizeCountryCode(market.country)).toBe(market.country);
			expect(normalizeLanguageCode(market.language)).toBe(market.language);
		}
	});
});
