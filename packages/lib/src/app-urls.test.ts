import { describe, expect, it } from "vitest";
import {
	brandParams,
	brandSegment,
	canonicalBrandHref,
	canonicalOrgHref,
	isValidSlug,
	MAX_SLUG_LENGTH,
	orgParams,
	orgSettingsPath,
	slugify,
} from "./app-urls";

const ACME = { id: "org_123", slug: "acme" };
const NIKE = { id: "nike", slug: "nike-running" };
const UNSLUGGED_BRAND = { id: "nike", slug: null };

function location(pathname: string, searchStr = "", hash = "") {
	return { pathname, searchStr, hash };
}

describe("URL segments", () => {
	it("prefers the slug", () => {
		expect(ACME.slug).toBe("acme");
		expect(brandSegment(NIKE)).toBe("nike-running");
	});

	it("falls back to the brand's id when a slug was never set", () => {
		expect(brandSegment(UNSLUGGED_BRAND)).toBe("nike");
	});

	it("builds route params from either form", () => {
		expect(orgParams(ACME)).toEqual({ org: "acme" });
		expect(brandParams(ACME, UNSLUGGED_BRAND)).toEqual({ org: "acme", brand: "nike" });
	});

	it("names the organization's own pages, encoding the segment", () => {
		expect(orgSettingsPath(ACME)).toBe("/app/org/acme/settings");
		expect(orgSettingsPath(ACME, "billing")).toBe("/app/org/acme/settings/billing");
		expect(orgSettingsPath({ slug: "a b" })).toBe("/app/org/a%20b/settings");
	});
});

describe("canonical hrefs", () => {
	it("swaps the organization segment and leaves the rest of the path alone", () => {
		expect(canonicalOrgHref(location("/app/org/org_123/brand/nike/citations"), "acme")).toBe(
			"/app/org/acme/brand/nike/citations",
		);
	});

	it("swaps the brand segment", () => {
		expect(canonicalBrandHref(location("/app/org/acme/brand/nike/prompts"), "nike-running")).toBe(
			"/app/org/acme/brand/nike-running/prompts",
		);
	});

	it("keeps the query string and the hash", () => {
		expect(canonicalOrgHref(location("/app/org/org_123/brand/nike", "?model=gpt-5&lookback=1m", "top"), "acme")).toBe(
			"/app/org/acme/brand/nike?model=gpt-5&lookback=1m#top",
		);
	});

	// The segment in the address bar is encoded while the resolved value is not,
	// so anything that measured an offset from the decoded value would land in the
	// wrong place here and truncate the path.
	it("survives an encoded segment ahead of the one being replaced", () => {
		expect(canonicalOrgHref(location("/app/org/a%20b%2Fc/brand/nike/citations"), "acme")).toBe(
			"/app/org/acme/brand/nike/citations",
		);
	});

	it("encodes the value it writes in", () => {
		expect(canonicalOrgHref(location("/app/org/org_123"), "a b")).toBe("/app/org/a%20b");
	});
});

describe("slugify", () => {
	it("lowercases", () => {
		expect(slugify("Acme", "brand")).toBe("acme");
	});

	it("replaces runs of non-alphanumerics with single hyphens", () => {
		expect(slugify("Acme Co!", "brand")).toBe("acme-co");
		expect(slugify("Foo   Bar", "brand")).toBe("foo-bar");
	});

	it("trims leading and trailing hyphens", () => {
		expect(slugify("  hello world  ", "brand")).toBe("hello-world");
		expect(slugify("!!!brand!!!", "brand")).toBe("brand");
	});

	// A name in a script with no ASCII alphanumerics has no segment to make, and
	// what to call it instead is the caller's to say.
	it("falls back to what the caller is minting", () => {
		expect(slugify("", "brand")).toBe("brand");
		expect(slugify("!!!", "organization")).toBe("organization");
		expect(slugify("会社", "organization")).toBe("organization");
	});

	it("preserves digits", () => {
		expect(slugify("Acme 2", "brand")).toBe("acme-2");
	});

	// A name is as long as someone wants it; the URL segment it becomes is not.
	it("bounds the length, without leaving a trailing hyphen behind", () => {
		expect(slugify("a".repeat(MAX_SLUG_LENGTH + 20), "brand")).toHaveLength(MAX_SLUG_LENGTH);
		expect(slugify(`${"a".repeat(MAX_SLUG_LENGTH - 1)} tail`, "brand")).toBe("a".repeat(MAX_SLUG_LENGTH - 1));
	});

	// Organizations and brands sit under static `org`/`brand` segments, so no name
	// can shadow a sibling route and nothing needs reserving.
	it("leaves route names alone", () => {
		expect(slugify("new", "brand")).toBe("new");
		expect(slugify("Settings", "brand")).toBe("settings");
	});
});

describe("isValidSlug", () => {
	// The two have to agree: a slug the producer emits and the validator refuses
	// is a record that can be created and then never saved again.
	it("accepts everything slugify produces", () => {
		const names = [
			"Acme",
			"Acme Co!",
			"  hello world  ",
			"!!!",
			"Acme 2",
			"The Very Long Brand Name For Enterprise Customers Incorporated",
			"Alexandra Christina Featherstonehaugh-Wellington's organization",
			"—".repeat(80),
			`${"a".repeat(MAX_SLUG_LENGTH)} tail`,
		];
		for (const name of names) {
			expect(isValidSlug(slugify(name, "brand")), name).toBe(true);
		}
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
