import { useParams } from "@tanstack/react-router";

/**
 * Route params for linking to the current organization, or null when the page sits
 * outside one (the picker itself, admin, the paywall).
 *
 * Null rather than an empty string: a caller that can't build a link needs to
 * render something else, and `/app/org//…` is not that.
 */
export function useOrganizationParams(): { org: string } | null {
	const org = useParams({ strict: false, select: (params) => params.org });
	return org ? { org } : null;
}

/**
 * Route params for linking within the current brand, or null off a brand page.
 *
 * The `brand` value is the segment already in the address bar, so navigation
 * stays off the canonicalizing redirect. For *identifying* a brand to the
 * server, use `useBrandId`.
 */
export function useBrandParams(): { org: string; brand: string } | null {
	const params = useParams({ strict: false, select: ({ org, brand }) => ({ org, brand }) });
	return params.org && params.brand ? { org: params.org, brand: params.brand } : null;
}
