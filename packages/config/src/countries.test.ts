import { describe, expect, it } from "vitest";
import { COUNTRIES, DEFAULT_COUNTRY, normalizeCountryCode, parseCountryFilter } from "./countries";

describe("countries", () => {
	it("offers the default country", () => {
		expect(normalizeCountryCode(DEFAULT_COUNTRY)).toBe(DEFAULT_COUNTRY);
	});

	it("names each country once", () => {
		expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
		expect(new Set(COUNTRIES.map((c) => c.numeric)).size).toBe(COUNTRIES.length);
	});

	it("accepts codes in either case and rejects ones it doesn't offer", () => {
		expect(normalizeCountryCode(" gb ")).toBe("GB");
		expect(normalizeCountryCode("XX")).toBeNull();
		expect(normalizeCountryCode("United Kingdom")).toBeNull();
	});

	it("reads a filter from a link, keeping the countries it can still name", () => {
		expect(parseCountryFilter("de,FR,xx,de")).toEqual(["DE", "FR"]);
		expect(parseCountryFilter("")).toEqual([]);
		expect(parseCountryFilter(undefined)).toEqual([]);
	});
});
