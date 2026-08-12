import { describe, expect, it } from "vitest";
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

	it("does not itself reserve route-colliding slugs (that's findUniqueBrandId's job)", () => {
		// "new" collides with /app/new, but slugify is a pure string transform —
		// only findUniqueBrandId (which needs a database) applies the reserved-slug
		// suffix rule.
		expect(slugify("new")).toBe("new");
	});
});
