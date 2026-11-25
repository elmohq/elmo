import { useMatches } from "@tanstack/react-router";
import { isOrgAdminRole } from "@workspace/config/roles";
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
	plain?: boolean;
}

export function useBreadcrumbs(): Crumb[] {
	const matches = useMatches();
	const subjects = routeSubjects(matches);

	return matches.flatMap((match): Crumb[] => {
		if (match.routeId === ORG_ROUTE_ID) {
			const org = subjects.organization;
			if (!org?.name) return [];
			return [{ label: org.name, href: match.pathname, kind: "Organization", plain: !isOrgAdminRole(org.role) }];
		}
		if (match.routeId === BRAND_ROUTE_ID) {
			const label = subjects.brand?.name;
			return label ? [{ label, href: match.pathname, kind: "Brand" }] : [];
		}
		return match.staticData.crumb ? [{ label: match.staticData.crumb, href: match.pathname }] : [];
	});
}
