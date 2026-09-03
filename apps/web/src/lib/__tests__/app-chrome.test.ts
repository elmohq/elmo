import { describe, expect, it } from "vitest";
import { selectAppChrome } from "@/lib/app-chrome";
import { BRAND_ROUTE_ID, ORG_ROUTE_ID } from "@/lib/route-subject";

const ORGANIZATION = {
	id: "org-1",
	name: "Acme",
	slug: "acme",
	brands: [],
	brandCreation: { kind: "allowed" as const },
};
const BRAND = { id: "brand-1", name: "Acme Shoes", slug: "shoes", onboarded: true };

const authed = { routeId: "/_authed", staticData: {} };
const organization = { routeId: ORG_ROUTE_ID, staticData: {}, loaderData: { organization: ORGANIZATION } };
const brand = { routeId: BRAND_ROUTE_ID, staticData: { nav: "brand" as const }, loaderData: { brand: BRAND } };

describe("selectAppChrome", () => {
	it("draws the rail the deepest declaring route asks for, with its subjects", () => {
		const page = { routeId: `${BRAND_ROUTE_ID}/citations`, staticData: {} };
		expect(selectAppChrome([authed, organization, brand, page])).toEqual({
			nav: "brand",
			organization: ORGANIZATION,
			brand: BRAND,
		});
	});

	it("lets a nested declaration override an outer one", () => {
		const gate = { routeId: "/_authed/admin/tools", staticData: { nav: "account" as const } };
		expect(
			selectAppChrome([authed, { routeId: "/_authed/admin", staticData: { nav: "admin" as const } }, gate])?.nav,
		).toBe("account");
	});

	it("leaves a page whose matches declare no rail standing alone", () => {
		const picker = { routeId: `${ORG_ROUTE_ID}/`, staticData: {} };
		expect(selectAppChrome([authed, organization, picker])).toBeNull();
	});

	it("keeps the rail while a layout's data is still on its way", () => {
		expect(
			selectAppChrome([authed, organization, { routeId: BRAND_ROUTE_ID, staticData: { nav: "brand" as const } }]),
		).toEqual({ nav: "brand", organization: ORGANIZATION, brand: undefined });
	});

	it("reads its subjects from loader data, not from route context", () => {
		const fromContext = {
			routeId: ORG_ROUTE_ID,
			staticData: { nav: "organization" as const },
			context: { organization: ORGANIZATION },
		};
		expect(selectAppChrome([authed, fromContext])).toEqual({ nav: "organization" });
	});
});
