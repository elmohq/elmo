import { useMatches } from "@tanstack/react-router";
import type { AppSidebarProps } from "@/components/app-sidebar";
import {
	ADMIN_ROUTE_ID,
	BRAND_ROUTE_ID,
	CHOOSE_PLAN_ROUTE_ID,
	ORG_SETTINGS_ROUTE_ID,
	REPORTS_ROUTE_ID,
	routeSubjects,
} from "@/lib/route-subject";

/**
 * Which rail the matched routes want, or null for the pages that stand alone —
 * the pickers, the onboarding steps, and the printable report.
 *
 * One shell reads this instead of each layout rendering its own, so moving
 * between a brand and its organization keeps the same sidebar and header
 * mounted rather than tearing one down to build the other. Derived from the
 * matched routes for the same reason the breadcrumbs are.
 */
export function useAppChrome(): AppSidebarProps | null {
	const matches = useMatches();
	const matched = new Set(matches.map((match) => match.routeId));
	const { organization, brand } = routeSubjects(matches);

	// `brand` is the layout's loader data, so it arrives a beat after the match
	// it belongs to. The rail renders without it rather than blinking out.
	if (matched.has(BRAND_ROUTE_ID) && organization) return { scope: "brand", organization, brand };
	if (matched.has(ORG_SETTINGS_ROUTE_ID) && organization) return { scope: "organization", organization };
	if (matched.has(ADMIN_ROUTE_ID) || matched.has(REPORTS_ROUTE_ID)) return { scope: "admin" };
	if (matched.has(CHOOSE_PLAN_ROUTE_ID)) return { scope: "account" };

	return null;
}
