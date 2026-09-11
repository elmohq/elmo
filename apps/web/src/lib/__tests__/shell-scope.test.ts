import { describe, expect, it } from "vitest";
import { BRAND_ROUTE_ID, ORG_ROUTE_ID } from "@/lib/route-subject";
import { selectShellScope } from "@/lib/shell-scope";

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
const brand = { routeId: BRAND_ROUTE_ID, staticData: { shell: "brand" as const }, loaderData: { brand: BRAND } };

describe("selectShellScope", () => {
	it("wraps a page in the shell the deepest declaring route asks for, with its subjects", () => {
		const page = { routeId: `${BRAND_ROUTE_ID}/citations`, staticData: {} };
		expect(selectShellScope([authed, organization, brand, page])).toEqual({
			section: "brand",
			organization: ORGANIZATION,
			brand: BRAND,
		});
	});

	it("lets a nested declaration override an outer one", () => {
		const gate = { routeId: "/_authed/admin/tools", staticData: { shell: "account" as const } };
		expect(
			selectShellScope([authed, { routeId: "/_authed/admin", staticData: { shell: "admin" as const } }, gate])?.section,
		).toBe("account");
	});

	it("leaves a page whose matches declare no shell standing alone", () => {
		const picker = { routeId: `${ORG_ROUTE_ID}/`, staticData: {} };
		expect(selectShellScope([authed, organization, picker])).toBeNull();
	});

	it("keeps the shell while a layout's data is still on its way", () => {
		expect(
			selectShellScope([authed, organization, { routeId: BRAND_ROUTE_ID, staticData: { shell: "brand" as const } }]),
		).toEqual({ section: "brand", organization: ORGANIZATION, brand: undefined });
	});

	it("reads its subjects from loader data, not from route context", () => {
		const fromContext = {
			routeId: ORG_ROUTE_ID,
			staticData: { shell: "organization" as const },
			context: { organization: ORGANIZATION },
		};
		expect(selectShellScope([authed, fromContext])).toEqual({ section: "organization" });
	});
});
