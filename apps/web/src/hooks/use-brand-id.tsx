import { useParams, useRouteContext } from "@tanstack/react-router";

/**
 * The brand the page is about, as an id.
 *
 * The `$brand` URL segment is the brand's slug where it has one and its id
 * otherwise, so it is not something to hand to a server function or use in a
 * query key. The `$brand` layout resolves it once and puts the id in route
 * context; this is how everything below reads it.
 *
 * Undefined outside a brand page, which is why callers that render in both
 * places take an explicit id and fall back to this.
 */
export function useBrandId(): string | undefined {
	const context = useRouteContext({ strict: false }) as { brandId?: string };
	return context.brandId;
}

/**
 * Route params for linking to the current workspace, or null when the page sits
 * outside one (the picker itself, admin, the paywall).
 *
 * Null rather than an empty string: a caller that can't build a link needs to
 * render something else, and `/app/org//…` is not that.
 */
export function useWorkspaceParams(): { org: string } | null {
	const org = useParams({ strict: false, select: (params) => params.org });
	return org ? { org } : null;
}

/**
 * Route params for linking within the current brand, or null off a brand page.
 *
 * The `brand` value is the segment already in the address bar — the brand's slug
 * where it has one and its id otherwise — so navigation stays off the
 * canonicalizing redirect. For *identifying* a brand to the server, use
 * `useBrandId`.
 */
export function useBrandParams(): { org: string; brand: string } | null {
	const params = useParams({ strict: false, select: ({ org, brand }) => ({ org, brand }) });
	return params.org && params.brand ? { org: params.org, brand: params.brand } : null;
}
