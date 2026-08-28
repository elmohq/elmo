/**
 * The breadcrumb trail, read off the routes that matched.
 *
 * A route says what it is called; the header renders the ones that did, in
 * match order. Nothing here parses the URL — the router already did that, and a
 * second parser indexing `pathname.split("/")` is how the trail and the address
 * bar drift apart when the shape changes.
 *
 * Two crumbs name a subject rather than a page — the workspace and the brand —
 * and their names come from the layouts that resolved them, since a route can
 * only declare something static about itself.
 */
import { useMatches } from "@tanstack/react-router";
import { workspaceTitle } from "@/lib/workspaces/naming";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/**
		 * What this route is called in the trail. Absent on pass-through layouts
		 * and on the routes whose subject is named below.
		 */
		crumb?: string;
	}
}

export interface Crumb {
	label: string;
	/** Where the crumb leads. The last crumb is the current page and leads nowhere. */
	href: string;
}

const ORG_ROUTE_ID = "/_authed/app/org/$org";
const BRAND_ROUTE_ID = "/_authed/app/org/$org/brand/$brand";

/**
 * The trail for the page being rendered.
 *
 * `workspaceName` and `brandName` are the resolved subjects of the two layouts
 * that have one; either may be absent while its layout is still loading, and
 * that crumb is simply left out until it arrives.
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
