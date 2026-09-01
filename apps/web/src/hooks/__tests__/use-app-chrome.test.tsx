/**
 * Five sections used to render their own sidebar; now one shell renders the
 * rail this mapping names. A section that falls out of it loses its navigation
 * with nothing else failing, and the plan gate — cloud-only, so it never runs
 * in the local end-to-end pass — would lose it unnoticed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSidebarProps } from "@/components/app-sidebar";
import {
	ADMIN_ROUTE_ID,
	BRAND_ROUTE_ID,
	CHOOSE_PLAN_ROUTE_ID,
	ORG_ROUTE_ID,
	ORG_SETTINGS_ROUTE_ID,
	REPORTS_ROUTE_ID,
} from "@/lib/route-subject";

const matches = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));
vi.mock("@tanstack/react-router", () => ({ useMatches: () => matches.current }));

const { useAppChrome } = await import("@/hooks/use-app-chrome");

const ORGANIZATION = { id: "org-1", name: "Acme", slug: "acme", brands: [] };
const BRAND = { id: "brand-1", name: "Acme Shoes", slug: "shoes", onboarded: true };

const orgMatch = { routeId: ORG_ROUTE_ID, context: { organization: ORGANIZATION } };
const brandMatch = { routeId: BRAND_ROUTE_ID, loaderData: { brand: BRAND } };

function chromeFor(routeMatches: Array<Record<string, unknown>>): AppSidebarProps | null {
	matches.current = routeMatches;
	let result: AppSidebarProps | null = null;
	function Probe() {
		result = useAppChrome();
		return null;
	}
	renderToStaticMarkup(<Probe />);
	return result;
}

describe("useAppChrome", () => {
	beforeEach(() => {
		matches.current = [];
	});

	it("gives a brand page the brand rail", () => {
		expect(chromeFor([orgMatch, brandMatch])).toEqual({ scope: "brand", organization: ORGANIZATION, brand: BRAND });
	});

	it("keeps the brand rail while the brand is still loading", () => {
		expect(chromeFor([orgMatch, { routeId: BRAND_ROUTE_ID }])).toEqual({
			scope: "brand",
			organization: ORGANIZATION,
			brand: undefined,
		});
	});

	it("gives organization settings the organization rail", () => {
		expect(chromeFor([orgMatch, { routeId: ORG_SETTINGS_ROUTE_ID }])).toEqual({
			scope: "organization",
			organization: ORGANIZATION,
		});
	});

	it.each([
		["the admin section", ADMIN_ROUTE_ID],
		["the reports list", REPORTS_ROUTE_ID],
	])("gives %s the admin rail", (_name, routeId) => {
		expect(chromeFor([{ routeId }])).toEqual({ scope: "admin" });
	});

	it("gives the plan gate a rail that leads nowhere", () => {
		expect(chromeFor([{ routeId: CHOOSE_PLAN_ROUTE_ID }])).toEqual({ scope: "account" });
	});

	it.each([
		["the organization picker", "/_authed/app/"],
		["a workspace's brand list", "/_authed/app/org/$org/"],
		["the printable report", "/_authed/reports/render/$reportId"],
		["an invitation", "/_authed/accept-invitation/$invitationId"],
	])("leaves %s without a rail", (_name, routeId) => {
		expect(chromeFor([{ routeId }])).toBeNull();
	});
});
