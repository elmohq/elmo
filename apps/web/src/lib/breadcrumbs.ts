/**
 * Read off the matched routes rather than parsed out of the pathname: a second
 * parser is how the trail and the address bar drift apart when the URL moves.
 */
import { useMatches } from "@tanstack/react-router";
import { BRAND_ROUTE_ID, ORG_ROUTE_ID, routeSubjects } from "@/lib/route-subject";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/** Absent on pass-through layouts and where the subject is dynamic. */
		crumb?: string;
	}
}

export interface Crumb {
	label: string;
	href: string;
	/** Rendered above the name, which tells an organization called Nike from a brand called Nike. */
	kind?: "Organization" | "Brand";
}

/**
 * The two dynamic crumbs name a thing rather than a page, so they come off the
 * layouts that resolved them. Either may be absent mid-load, and its crumb is
 * left out until it arrives.
 */
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
