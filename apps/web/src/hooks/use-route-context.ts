import { useRouteContext } from "@tanstack/react-router";

/**
 * Read the context of the match the calling component belongs to — never a
 * named ancestor.
 *
 * The router keys its match stores by route id, so a navigation overwrites the
 * store for a route id the next location still uses and empties the ones it
 * drops, all while the current tree is still mounted. A component that reads
 * `{ from: SOME_ANCESTOR_ROUTE_ID }` therefore sees the next page's
 * organization or brand — or nothing at all, which throws — for as long as the
 * transition is open. Its own match cannot drift that way: the match and the
 * component that reads it appear and disappear together.
 *
 * So nothing in this app passes `from:`. Everything a page needs to know about
 * its organization or brand is inherited context, and reading it from here is
 * what makes it a snapshot of the page being rendered.
 */
export function useLooseRouteContext() {
	return useRouteContext({ strict: false });
}

export function useViewer(): { isAdmin: boolean; hasReportAccess: boolean } {
	const context = useLooseRouteContext();
	return { isAdmin: context.isAdmin ?? false, hasReportAccess: context.hasReportAccess ?? false };
}
