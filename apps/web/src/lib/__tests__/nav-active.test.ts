import { describe, expect, it } from "vitest";
import { activeNavHref } from "@/lib/nav-active";

const BRAND = "/app/org/acme/brand/nike";
const brandRail = [
	{ href: BRAND, exact: true },
	{ href: `${BRAND}/visibility` },
	{ href: `${BRAND}/settings/prompts` },
	{ href: `${BRAND}/settings/brand` },
];

describe("activeNavHref", () => {
	it("lights the entry whose page you are on", () => {
		expect(activeNavHref(brandRail, `${BRAND}/visibility`)).toBe(`${BRAND}/visibility`);
	});

	it("lights the entry a sub-page belongs to", () => {
		expect(activeNavHref(brandRail, `${BRAND}/visibility/anything`)).toBe(`${BRAND}/visibility`);
	});

	it("prefers the longest match", () => {
		expect(activeNavHref(brandRail, `${BRAND}/settings/prompts`)).toBe(`${BRAND}/settings/prompts`);
	});

	it("lights an exact entry only on its own page", () => {
		expect(activeNavHref(brandRail, BRAND)).toBe(BRAND);
		expect(activeNavHref(brandRail, `${BRAND}/prompts/abc`)).toBe("");
	});

	it("lights nothing off the rail entirely", () => {
		expect(activeNavHref(brandRail, "/admin")).toBe("");
	});

	it("lights the right one of two entries that share a title", () => {
		const rail = [{ href: "/app/org/acme/settings/brands" }, { href: "/admin" }];
		expect(activeNavHref(rail, "/admin")).toBe("/admin");
		expect(activeNavHref(rail, "/app/org/acme/settings/brands")).toBe("/app/org/acme/settings/brands");
	});
});
