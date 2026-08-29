import { describe, expect, it } from "vitest";
import { isValidSlug, MAX_SLUG_LENGTH } from "../app-urls";
import { firstFreeName } from "./provisioning";

/** Stands in for the availability query, so the rule is testable without a database. */
const taken = (...names: string[]) => {
	const set = new Set(names);
	return async (candidate: string) => !set.has(candidate);
};

describe("firstFreeName", () => {
	it("keeps the plain name when nothing answers to it", async () => {
		expect(await firstFreeName("nike", taken())).toBe("nike");
	});

	it("counts up past whatever is taken", async () => {
		expect(await firstFreeName("nike", taken("nike"))).toBe("nike-2");
		expect(await firstFreeName("nike", taken("nike", "nike-2", "nike-3"))).toBe("nike-4");
	});

	// The whole point of fitting rather than appending: a suffixed name that runs
	// past the bound is one the settings form would refuse to save back.
	it("fits the suffix inside the bound, and the result is still a valid slug", async () => {
		const base = "a".repeat(MAX_SLUG_LENGTH);
		const name = await firstFreeName(base, taken(base));
		expect(name.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
		expect(isValidSlug(name)).toBe(true);
		expect(name.endsWith("-2")).toBe(true);
	});

	it("leaves no trailing hyphen where the truncation lands on one", async () => {
		const base = `${"a".repeat(MAX_SLUG_LENGTH - 3)}-bb`;
		const name = await firstFreeName(base, taken(base));
		expect(isValidSlug(name)).toBe(true);
	});

	// Past the counted suffixes something is wrong with the base; the loop ends
	// rather than walking the namespace a row at a time.
	it("ends on a base whose every counted suffix is taken", async () => {
		const everyCountedSuffix = ["nike", ...Array.from({ length: 60 }, (_, i) => `nike-${i + 2}`)];
		const name = await firstFreeName("nike", taken(...everyCountedSuffix));
		expect(isValidSlug(name)).toBe(true);
		expect(everyCountedSuffix).not.toContain(name);
	});
});
