/**
 * Read off the matched routes rather than parsed out of the pathname: a second
 * parser is how the trail and the address bar drift apart when the URL moves.
 */
import { useMatches } from "@tanstack/react-router";
import { workspaceTitle } from "@/lib/workspaces/naming";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/** Absent on pass-through layouts and where the subject is dynamic. */
		crumb?: string;
	}
}

export interface Crumb {
	label: string;
	href: string;
}

const ORG_ROUTE_ID = "/_authed/app/org/$org";
const BRAND_ROUTE_ID = "/_authed/app/org/$org/brand/$brand";

/**
 * The two dynamic crumbs come in as subjects because a route can only declare
 * something static about itself. Either may be absent mid-load, and its crumb
 * is left out until it arrives.
 */
export function useBreadcrumbs(subjects: { workspaceName?: string; brandName?: string }): Crumb[] {
	const matches = useMatches();

	return matches.flatMap((match): Crumb[] => {
		const label =
			match.routeId === ORG_ROUTE_ID
				? subjects.workspaceName && workspaceTitle(subjects.workspaceName)
				: match.routeId === BRAND_ROUTE_ID
					? subjects.brandName
					: match.staticData.crumb;
		return label ? [{ label, href: match.pathname }] : [];
	});
}
