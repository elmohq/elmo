import { describe, expect, it } from "vitest";
import { isValidSlug, MAX_SLUG_LENGTH } from "../app-urls";
import { firstUnused, nameCandidates } from "./unique-names";

describe("nameCandidates", () => {
	it("offers the plain name first, so a free one is what a new record gets", () => {
		expect(nameCandidates("nike")[0]).toBe("nike");
	});

	it("suffixes the rest, and every one is a slug the settings form would save back", () => {
		for (const base of ["nike", "a".repeat(MAX_SLUG_LENGTH), `${"a".repeat(MAX_SLUG_LENGTH - 3)}-bb`]) {
			for (const candidate of nameCandidates(base).slice(1)) {
				expect(candidate.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
				expect(isValidSlug(candidate)).toBe(true);
			}
		}
	});

	it("varies the suffixes, so two concurrent creates of one name rarely collide", () => {
		const suffixes = new Set(Array.from({ length: 40 }, () => nameCandidates("nike").slice(1)).flat());
		expect(suffixes.size).toBeGreaterThan(1);
	});
});

describe("firstUnused", () => {
	it("keeps the plain name when nothing answers to it", () => {
		expect(firstUnused(["nike", "nike-047"], new Set())).toBe("nike");
	});

	it("falls through to a suffixed one", () => {
		expect(firstUnused(["nike", "nike-047", "nike-819"], new Set(["nike", "nike-047"]))).toBe("nike-819");
	});

	it("throws rather than widening the search when every candidate is taken", () => {
		expect(() => firstUnused(["nike", "nike-047"], new Set(["nike", "nike-047"]))).toThrow(/nike/);
	});
});
