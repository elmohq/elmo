import { describe, expect, it } from "vitest";
import { parseDomainRatingResponse } from "./ahrefs";

describe("parseDomainRatingResponse", () => {
	it("extracts the nested rating", () => {
		expect(parseDomainRatingResponse({ domain_rating: { domain_rating: 72.5 } })).toBe(72.5);
	});

	it("returns 0 for a genuine zero rating (not null)", () => {
		expect(parseDomainRatingResponse({ domain_rating: { domain_rating: 0 } })).toBe(0);
	});

	it("returns null for malformed or missing shapes", () => {
		expect(parseDomainRatingResponse(null)).toBeNull();
		expect(parseDomainRatingResponse(undefined)).toBeNull();
		expect(parseDomainRatingResponse("nope")).toBeNull();
		expect(parseDomainRatingResponse({})).toBeNull();
		expect(parseDomainRatingResponse({ domain_rating: {} })).toBeNull();
		expect(parseDomainRatingResponse({ domain_rating: { domain_rating: "high" } })).toBeNull();
		expect(parseDomainRatingResponse({ domain_rating: { domain_rating: Number.NaN } })).toBeNull();
	});
});
