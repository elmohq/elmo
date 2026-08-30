import { describe, expect, it } from "vitest";
import { isValidSlug, MAX_SLUG_LENGTH } from "../app-urls";
import { firstFreeName } from "./provisioning";

/** Stands in for the availability query. */
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

	// A suffixed name past the bound is one the settings form would refuse to save.
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

	it("ends on a base whose every counted suffix is taken", async () => {
		const everyCountedSuffix = ["nike", ...Array.from({ length: 60 }, (_, i) => `nike-${i + 2}`)];
		const name = await firstFreeName("nike", taken(...everyCountedSuffix));
		expect(isValidSlug(name)).toBe(true);
		expect(everyCountedSuffix).not.toContain(name);
	});
});
