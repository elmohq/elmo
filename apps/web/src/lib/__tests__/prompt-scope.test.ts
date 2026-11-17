import { describe, expect, it } from "vitest";
import { localeFilter, localesInUse } from "../prompt-scope";

const brand = { country: "DE", language: "de" };
const prompt = (country: string | null, language: string | null, enabled = true) => ({ country, language, enabled });

describe("localesInUse", () => {
	it("lists the brand's own country and language first, then the others by how many prompts use them", () => {
		const { countries, languages } = localesInUse(brand, [
			prompt("FR", "fr"),
			prompt("FR", "fr"),
			prompt("US", "en"),
			prompt(null, null),
		]);
		expect(countries).toEqual([
			{ code: "DE", prompts: 1 },
			{ code: "FR", prompts: 2 },
			{ code: "US", prompts: 1 },
		]);
		expect(languages.map((entry) => entry.code)).toEqual(["de", "fr", "en"]);
	});

	it("counts a country and a language separately, so one language can span countries", () => {
		const { countries, languages } = localesInUse(brand, [prompt("AT", null), prompt("CH", null), prompt(null, null)]);
		expect(countries.map((entry) => entry.code)).toEqual(["DE", "AT", "CH"]);
		expect(languages).toEqual([{ code: "de", prompts: 3 }]);
	});

	it("leaves out what only disabled prompts use", () => {
		expect(localesInUse(brand, [prompt(null, null), prompt("FR", "fr", false)]).countries).toEqual([
			{ code: "DE", prompts: 1 },
		]);
	});
});

describe("localeFilter", () => {
	it("matches every prompt when no filter names a known code", () => {
		expect(localeFilter({}, brand)(prompt("FR", "fr"))).toBe(true);
		expect(localeFilter({ countries: "nonsense" }, brand)(prompt("FR", "fr"))).toBe(true);
	});

	it("matches a prompt by the country it resolves to, whatever its language", () => {
		const germany = localeFilter({ countries: "DE" }, brand);
		expect(germany(prompt(null, null))).toBe(true);
		expect(germany(prompt(null, "en"))).toBe(true);
		expect(germany(prompt("FR", "fr"))).toBe(false);
	});

	it("matches a language across countries", () => {
		const german = localeFilter({ languages: "de" }, brand);
		expect(german(prompt("AT", null))).toBe(true);
		expect(german(prompt("CH", "fr"))).toBe(false);
	});

	it("requires both when a country and a language are filtered", () => {
		const swissFrench = localeFilter({ countries: "CH", languages: "fr" }, brand);
		expect(swissFrench(prompt("CH", "fr"))).toBe(true);
		expect(swissFrench(prompt("CH", "de"))).toBe(false);
		expect(swissFrench(prompt("FR", "fr"))).toBe(false);
	});
});
