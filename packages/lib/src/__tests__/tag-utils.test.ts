import { describe, it, expect } from "vitest";
import {
	isSystemTag,
	isPromptBranded,
	computeSystemTags,
	normalizeTag,
	sanitizeUserTags,
} from "../tag-utils";
import { SYSTEM_TAGS } from "../db/schema";

describe("tag-utils", () => {
	describe("isSystemTag", () => {
		it("should return true for branded system tag", () => {
			expect(isSystemTag("branded")).toBe(true);
			expect(isSystemTag("BRANDED")).toBe(true);
			expect(isSystemTag("Branded")).toBe(true);
		});

		it("should return true for unbranded system tag", () => {
			expect(isSystemTag("unbranded")).toBe(true);
			expect(isSystemTag("UNBRANDED")).toBe(true);
		});

		it("should return false for non-system tags", () => {
			expect(isSystemTag("custom")).toBe(false);
			expect(isSystemTag("my-tag")).toBe(false);
			expect(isSystemTag("")).toBe(false);
		});
	});

	describe("isPromptBranded", () => {
		const brandName = "Acme Corp";
		const brandWebsite = "https://www.acmecorp.com";

		it("should return true when prompt contains brand name", () => {
			expect(isPromptBranded("best Acme Corp products", brandName, brandWebsite)).toBe(true);
			expect(isPromptBranded("acme corp alternatives", brandName, brandWebsite)).toBe(true);
		});

		it("should return true when prompt contains domain", () => {
			expect(isPromptBranded("products from acmecorp.com", brandName, brandWebsite)).toBe(true);
		});

		it("should return true when prompt contains domain without TLD", () => {
			expect(isPromptBranded("best acmecorp products", brandName, brandWebsite)).toBe(true);
		});

		it("should return false when prompt does not contain brand", () => {
			expect(isPromptBranded("best shoes for running", brandName, brandWebsite)).toBe(false);
			expect(isPromptBranded("where to buy sneakers", brandName, brandWebsite)).toBe(false);
		});

		it("should handle websites without protocol", () => {
			expect(isPromptBranded("acmecorp products", brandName, "acmecorp.com")).toBe(true);
		});

		it("should handle websites with www prefix", () => {
			expect(isPromptBranded("acmecorp products", brandName, "www.acmecorp.com")).toBe(true);
		});

		it("should handle invalid URLs gracefully", () => {
			// Should still match brand name even with invalid URL
			expect(isPromptBranded("Acme Corp products", brandName, "not-a-valid-url")).toBe(true);
			expect(isPromptBranded("random products", brandName, "not-a-valid-url")).toBe(false);
		});
	});

	describe("computeSystemTags", () => {
		it("should return branded tag when prompt contains brand", () => {
			const tags = computeSystemTags("best Acme products", "Acme", "https://acme.com");
			expect(tags).toContain(SYSTEM_TAGS.BRANDED);
			expect(tags).not.toContain(SYSTEM_TAGS.UNBRANDED);
		});

		it("should return unbranded tag when prompt does not contain brand", () => {
			const tags = computeSystemTags("best running shoes", "Acme", "https://acme.com");
			expect(tags).toContain(SYSTEM_TAGS.UNBRANDED);
			expect(tags).not.toContain(SYSTEM_TAGS.BRANDED);
		});

		it("should return exactly one tag", () => {
			const brandedTags = computeSystemTags("acme products", "Acme", "https://acme.com");
			const unbrandedTags = computeSystemTags("generic products", "Acme", "https://acme.com");
			
			expect(brandedTags).toHaveLength(1);
			expect(unbrandedTags).toHaveLength(1);
		});
	});

	describe("normalizeTag", () => {
		it("should lowercase tags", () => {
			expect(normalizeTag("UPPERCASE")).toBe("uppercase");
			expect(normalizeTag("MixedCase")).toBe("mixedcase");
		});

		it("should trim whitespace", () => {
			expect(normalizeTag("  tag  ")).toBe("tag");
			expect(normalizeTag("\ttab\t")).toBe("tab");
		});

		it("should handle empty string", () => {
			expect(normalizeTag("")).toBe("");
			expect(normalizeTag("   ")).toBe("");
		});
	});

	describe("sanitizeUserTags", () => {
		it("should normalize and dedupe tags", () => {
			const result = sanitizeUserTags(["Tag", "TAG", "tag"]);
			expect(result).toEqual(["tag"]);
		});

		it("should filter out empty tags", () => {
			const result = sanitizeUserTags(["valid", "", "  ", "another"]);
			expect(result).toEqual(["valid", "another"]);
		});

		it("should filter out system tags", () => {
			const result = sanitizeUserTags(["custom", "branded", "unbranded", "my-tag"]);
			expect(result).toEqual(["custom", "my-tag"]);
		});

		it("should handle mixed case system tags", () => {
			const result = sanitizeUserTags(["BRANDED", "Unbranded", "valid"]);
			expect(result).toEqual(["valid"]);
		});

		it("should preserve order of first occurrences", () => {
			const result = sanitizeUserTags(["first", "second", "FIRST", "third"]);
			expect(result).toEqual(["first", "second", "third"]);
		});

		it("should handle empty array", () => {
			expect(sanitizeUserTags([])).toEqual([]);
		});
	});
});
