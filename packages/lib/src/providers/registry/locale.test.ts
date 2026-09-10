import { afterEach, describe, expect, it } from "vitest";
import {
	BRIGHTDATA_SERP_COUNTRY_FALLBACK,
	CLORO_COUNTRY_FALLBACK,
	DFS_LOCATION_CODE_FALLBACK,
	getBrightdataSerpCountry,
	getCloroCountry,
	getDfsLocationCode,
} from "./locale";

const VARS = ["DATAFORSEO_LOCATION_CODE", "CLORO_COUNTRY", "BRIGHTDATA_SERP_COUNTRY"] as const;
const original = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));

afterEach(() => {
	for (const v of VARS) {
		if (original[v] === undefined) delete process.env[v];
		else process.env[v] = original[v];
	}
});

function set(name: (typeof VARS)[number], value: string | undefined) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

/**
 * The fallbacks are the values these were hardcoded to, so an existing
 * deployment that sets nothing must be unchanged. Every rejection below falls
 * back rather than passing a malformed value to a provider, where it would
 * silently return results for the wrong market — the failure this is meant to
 * make impossible, not a different-shaped version of it.
 */
describe("getDfsLocationCode", () => {
	it("keeps the previously hardcoded value when unset", () => {
		set("DATAFORSEO_LOCATION_CODE", undefined);
		expect(getDfsLocationCode()).toBe(DFS_LOCATION_CODE_FALLBACK);
		expect(DFS_LOCATION_CODE_FALLBACK).toBe(2840);
	});

	it("accepts a location code", () => {
		set("DATAFORSEO_LOCATION_CODE", "2826");
		expect(getDfsLocationCode()).toBe(2826);
	});

	it.each(["", "  ", "GB", "2826.5", "-1", "0", "not-a-code"])("falls back on %j", (value) => {
		set("DATAFORSEO_LOCATION_CODE", value);
		expect(getDfsLocationCode()).toBe(DFS_LOCATION_CODE_FALLBACK);
	});
});

describe("getCloroCountry", () => {
	it("keeps the previously hardcoded value when unset", () => {
		set("CLORO_COUNTRY", undefined);
		expect(getCloroCountry()).toBe(CLORO_COUNTRY_FALLBACK);
		expect(CLORO_COUNTRY_FALLBACK).toBe("US");
	});

	it("upper-cases, because Cloro expects an upper-case alpha-2", () => {
		set("CLORO_COUNTRY", "gb");
		expect(getCloroCountry()).toBe("GB");
	});

	it("tolerates surrounding whitespace from a hand-edited .env", () => {
		set("CLORO_COUNTRY", " de ");
		expect(getCloroCountry()).toBe("DE");
	});

	it.each(["", "GBR", "U", "United Kingdom", "g1"])("falls back on %j", (value) => {
		set("CLORO_COUNTRY", value);
		expect(getCloroCountry()).toBe(CLORO_COUNTRY_FALLBACK);
	});
});

describe("getBrightdataSerpCountry", () => {
	it("keeps the previously hardcoded value when unset", () => {
		set("BRIGHTDATA_SERP_COUNTRY", undefined);
		expect(getBrightdataSerpCountry()).toBe(BRIGHTDATA_SERP_COUNTRY_FALLBACK);
		expect(BRIGHTDATA_SERP_COUNTRY_FALLBACK).toBe("us");
	});

	it("lower-cases, because Google's `gl` expects a lower-case alpha-2", () => {
		set("BRIGHTDATA_SERP_COUNTRY", "GB");
		expect(getBrightdataSerpCountry()).toBe("gb");
	});

	it.each(["", "GBR", "United Kingdom"])("falls back on %j", (value) => {
		set("BRIGHTDATA_SERP_COUNTRY", value);
		expect(getBrightdataSerpCountry()).toBe(BRIGHTDATA_SERP_COUNTRY_FALLBACK);
	});
});
