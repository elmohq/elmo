import { describe, expect, it } from "vitest";
import { normalizeTag, readTagsInput, sanitizeUserTags } from "./tag-utils";

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

describe("readTagsInput", () => {
	it("reads a lone legacy type tag as the override and keeps the rest as tags", () => {
		expect(readTagsInput(["Pricing", "unbranded"])).toEqual({ tags: ["pricing"], brandedOverride: false });
	});

	it("prefers an explicit branded value over a legacy tag, including null", () => {
		expect(readTagsInput(["branded"], false)).toEqual({ tags: [], brandedOverride: false });
		expect(readTagsInput(["branded"], null)).toEqual({ tags: [], brandedOverride: null });
	});

	it("leaves the override unset when no single type is sent", () => {
		expect(readTagsInput(["pricing"])).toEqual({ tags: ["pricing"] });
		expect(readTagsInput(["branded", "unbranded"])).toEqual({ tags: [] });
	});
});
