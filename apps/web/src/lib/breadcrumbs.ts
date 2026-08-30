import { useMatches } from "@tanstack/react-router";
import { BRAND_ROUTE_ID, ORG_ROUTE_ID, routeSubjects } from "@/lib/route-subject";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		crumb?: string;
	}
}

export interface Crumb {
	label: string;
	href: string;
	kind?: "Organization" | "Brand";
}

export function useBreadcrumbs(): Crumb[] {
	const matches = useMatches();
	const subjects = routeSubjects(matches);

	return matches.flatMap((match): Crumb[] => {
		if (match.routeId === ORG_ROUTE_ID) {
			const label = subjects.organizationName;
			return label ? [{ label, href: match.pathname, kind: "Organization" }] : [];
		}
		if (match.routeId === BRAND_ROUTE_ID) {
			const label = subjects.brandName;
			return label ? [{ label, href: match.pathname, kind: "Brand" }] : [];
		}
		return match.staticData.crumb ? [{ label: match.staticData.crumb, href: match.pathname }] : [];
	});
}
