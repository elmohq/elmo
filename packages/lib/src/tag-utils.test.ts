import { describe, expect, it } from "vitest";
import { normalizeTag, sanitizeUserTags } from "./tag-utils";

describe("normalizeTag", () => {
	it("lowercases and trims", () => {
		expect(normalizeTag("  MixedCase\t")).toBe("mixedcase");
		expect(normalizeTag("   ")).toBe("");
	});
});

describe("sanitizeUserTags", () => {
	it("normalizes, drops empties, and dedupes keeping first occurrence order", () => {
		expect(sanitizeUserTags(["First", "", "second", "FIRST", "  ", "third"])).toEqual(["first", "second", "third"]);
	});

	it("never keeps branded or unbranded, which are the prompt type rather than tags", () => {
		expect(sanitizeUserTags(["pricing", "Branded", "UNBRANDED"])).toEqual(["pricing"]);
	});
});
