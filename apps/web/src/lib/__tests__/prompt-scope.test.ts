import { describe, expect, it } from "vitest";
import { marketFilter, marketsInUse } from "../prompt-scope";

const brand = { country: "DE", language: "de" };
const prompt = (country: string | null, language: string | null, enabled = true) => ({ country, language, enabled });

describe("marketsInUse", () => {
	it("lists the brand's own market first, then the others by how many prompts they hold", () => {
		const markets = marketsInUse(brand, [
			prompt("FR", "fr"),
			prompt("FR", "fr"),
			prompt("US", "en"),
			prompt(null, null),
		]);
		expect(markets).toEqual([
			{ country: "DE", language: "de", prompts: 1 },
			{ country: "FR", language: "fr", prompts: 2 },
			{ country: "US", language: "en", prompts: 1 },
		]);
	});

	it("leaves out markets only disabled prompts are in", () => {
		expect(marketsInUse(brand, [prompt(null, null), prompt("FR", "fr", false)])).toEqual([
			{ country: "DE", language: "de", prompts: 1 },
		]);
	});

	it("resolves a prompt that overrides only its country against the brand's language", () => {
		expect(marketsInUse(brand, [prompt("AT", null)])).toEqual([{ country: "AT", language: "de", prompts: 1 }]);
	});
});

describe("marketFilter", () => {
	it("matches every prompt when the filter names no known market", () => {
		expect(marketFilter(undefined, brand)(prompt("FR", "fr"))).toBe(true);
		expect(marketFilter("nonsense", brand)(prompt("FR", "fr"))).toBe(true);
	});

	it("matches a prompt by the market it resolves to", () => {
		const german = marketFilter("de-DE", brand);
		expect(german(prompt(null, null))).toBe(true);
		expect(german(prompt("FR", "fr"))).toBe(false);
	});
});
