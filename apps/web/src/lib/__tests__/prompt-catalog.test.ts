import { describe, expect, it } from "vitest";
import { resolvePromptCatalogQuery, validatePromptCatalogSearch } from "@/lib/prompt-catalog";

describe("validatePromptCatalogSearch", () => {
	it("keeps only the keys that differ from the default first page", () => {
		expect(validatePromptCatalogSearch({})).toEqual({});
		expect(validatePromptCatalogSearch({ page: 1, q: "", tag: "", status: "all" })).toEqual({});
		expect(validatePromptCatalogSearch({ page: "3", q: " shoes ", tag: " Running ", status: "disabled" })).toEqual({
			page: 3,
			q: "shoes",
			tag: "running",
			status: "disabled",
		});
	});

	it("falls back to the default for anything it cannot use", () => {
		expect(validatePromptCatalogSearch({ page: 0, status: "archived", q: 42, tag: ["a"] })).toEqual({});
		expect(validatePromptCatalogSearch({ page: "abc" })).toEqual({});
		expect(validatePromptCatalogSearch({ q: "x".repeat(300) })).toEqual({});
	});

	it("resolves a partial search back to a full query", () => {
		expect(resolvePromptCatalogQuery({ page: 7 })).toEqual({ page: 7, q: "", tag: "", status: "all" });
	});
});
