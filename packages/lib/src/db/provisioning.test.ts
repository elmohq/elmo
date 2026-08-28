import { describe, expect, it } from "vitest";
import { isValidSlug, MAX_SLUG_LENGTH } from "../app-urls";
import { slugify } from "./provisioning";

describe("slugify", () => {
	it("lowercases", () => {
		expect(slugify("Acme")).toBe("acme");
	});

	it("replaces runs of non-alphanumerics with single hyphens", () => {
		expect(slugify("Acme Co!")).toBe("acme-co");
		expect(slugify("Foo   Bar")).toBe("foo-bar");
	});

	it("trims leading and trailing hyphens", () => {
		expect(slugify("  hello world  ")).toBe("hello-world");
		expect(slugify("!!!brand!!!")).toBe("brand");
	});

	it("falls back to 'brand' for empty / non-alphanumeric input", () => {
		expect(slugify("")).toBe("brand");
		expect(slugify("!!!")).toBe("brand");
	});

	it("preserves digits", () => {
		expect(slugify("Acme 2")).toBe("acme-2");
	});

	// Workspaces and brands sit under static `org`/`brand` segments, so no name
	// can shadow a sibling route and nothing needs reserving.
	it("leaves route names alone", () => {
		expect(slugify("new")).toBe("new");
		expect(slugify("Settings")).toBe("settings");
	});
});

describe("isValidSlug", () => {
	it("accepts what slugify produces", () => {
		expect(isValidSlug("acme")).toBe(true);
		expect(isValidSlug("acme-co-2")).toBe(true);
		expect(isValidSlug("2024")).toBe(true);
	});

	it("rejects anything that wouldn't read as one URL segment", () => {
		expect(isValidSlug("")).toBe(false);
		expect(isValidSlug("Acme")).toBe(false);
		expect(isValidSlug("acme co")).toBe(false);
		expect(isValidSlug("acme/co")).toBe(false);
		expect(isValidSlug("-acme")).toBe(false);
		expect(isValidSlug("acme-")).toBe(false);
		expect(isValidSlug("acme--co")).toBe(false);
	});

	it("bounds the length", () => {
		expect(isValidSlug("a".repeat(MAX_SLUG_LENGTH))).toBe(true);
		expect(isValidSlug("a".repeat(MAX_SLUG_LENGTH + 1))).toBe(false);
	});

	// Route names are ordinary slugs now; the only thing that could make one
	// ambiguous is colliding with an id, which is an availability question.
	it("has no opinion about route names", () => {
		expect(isValidSlug("new")).toBe(true);
		expect(isValidSlug("settings")).toBe(true);
		expect(isValidSlug("org")).toBe(true);
		expect(isValidSlug("brand")).toBe(true);
	});
});
