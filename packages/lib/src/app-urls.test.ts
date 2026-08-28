import { describe, expect, it } from "vitest";
import {
	brandParams,
	brandPath,
	brandSegment,
	canonicalBrandHref,
	canonicalOrgHref,
	orgParams,
	orgSegment,
	workspacePath,
	workspaceSettingsPath,
} from "./app-urls";

const ACME = { id: "org_123", slug: "acme" };
const NIKE = { id: "nike", slug: "nike-running" };
const UNSLUGGED_BRAND = { id: "nike", slug: null };

function location(pathname: string, searchStr = "", hash = "") {
	return { pathname, searchStr, hash };
}

describe("URL segments", () => {
	it("prefers the slug", () => {
		expect(orgSegment(ACME)).toBe("acme");
		expect(brandSegment(NIKE)).toBe("nike-running");
	});

	it("falls back to the brand's id when a slug was never set", () => {
		expect(brandSegment(UNSLUGGED_BRAND)).toBe("nike");
	});

	it("builds route params from either form", () => {
		expect(orgParams(ACME)).toEqual({ org: "acme" });
		expect(brandParams(ACME, UNSLUGGED_BRAND)).toEqual({ org: "acme", brand: "nike" });
	});

	it("encodes segments in string paths", () => {
		expect(workspacePath(ACME)).toBe("/app/org/acme");
		expect(brandPath(ACME, NIKE)).toBe("/app/org/acme/brand/nike-running");
		expect(brandPath({ slug: "a b" }, { id: "c/d", slug: null })).toBe("/app/org/a%20b/brand/c%2Fd");
	});

	it("names the workspace's own pages", () => {
		expect(workspaceSettingsPath(ACME)).toBe("/app/org/acme/settings");
		expect(workspaceSettingsPath(ACME, "billing")).toBe("/app/org/acme/settings/billing");
	});
});

describe("canonical hrefs", () => {
	it("swaps the workspace segment and leaves the rest of the path alone", () => {
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
