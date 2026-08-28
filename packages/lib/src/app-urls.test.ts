import { describe, expect, it } from "vitest";
import {
	brandParams,
	brandPath,
	brandSegment,
	canonicalBrandHref,
	canonicalOrgHref,
	orgParams,
	orgSegment,
	parseStrandedAppPath,
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

describe("parseStrandedAppPath", () => {
	it("reads the identifier out of a pre-workspace link", () => {
		expect(parseStrandedAppPath("/app/nike")).toEqual({ candidate: "nike", rest: "" });
		expect(parseStrandedAppPath("/app/nike/citations")).toEqual({ candidate: "nike", rest: "citations" });
		expect(parseStrandedAppPath("/app/nike/settings/billing")).toEqual({
			candidate: "nike",
			rest: "settings/billing",
		});
	});

	it("decodes the identifier", () => {
		expect(parseStrandedAppPath("/app/a%20b/citations")).toEqual({ candidate: "a b", rest: "citations" });
	});

	// A miss under the current shape is a genuinely unknown workspace, not a
	// legacy link — retrying it as a brand name would resolve the wrong thing.
	it("ignores paths already in the current shape", () => {
		expect(parseStrandedAppPath("/app/org/acme/brand/nike")).toBeNull();
	});

	it("ignores anything that isn't an /app path", () => {
		expect(parseStrandedAppPath("/app")).toBeNull();
		expect(parseStrandedAppPath("/app/")).toBeNull();
		expect(parseStrandedAppPath("/reports/render/abc")).toBeNull();
		expect(parseStrandedAppPath("/")).toBeNull();
	});

	it("gives up on an undecodable segment rather than throwing", () => {
		expect(parseStrandedAppPath("/app/%E0%A4%A")).toBeNull();
	});
});
