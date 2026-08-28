/**
 * Read off the matched routes rather than parsed out of the pathname: a second
 * parser is how the trail and the address bar drift apart when the URL moves.
 */
import { useMatches } from "@tanstack/react-router";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/** Absent on pass-through layouts and where the subject is dynamic. */
		crumb?: string;
	}
}

export interface Crumb {
	label: string;
	href: string;
	/**
	 * What the label names, for the two crumbs that name a thing rather than a
	 * page. Rendered above the name, which is what tells an organization called
	 * Nike apart from a brand called Nike.
	 */
	kind?: "Organization" | "Brand";
}

const ORG_ROUTE_ID = "/_authed/app/org/$org";
const BRAND_ROUTE_ID = "/_authed/app/org/$org/brand/$brand";

/**
 * The two dynamic crumbs come in as subjects because a route can only declare
 * something static about itself. Either may be absent mid-load, and its crumb
 * is left out until it arrives.
 */
export function useBreadcrumbs(subjects: { organizationName?: string; brandName?: string }): Crumb[] {
	const matches = useMatches();

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
