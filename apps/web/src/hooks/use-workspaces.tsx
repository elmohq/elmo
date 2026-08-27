import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { listWorkspacesFn, type WorkspaceWithBrands } from "@/server/workspaces";

export const workspaceKeys = {
	all: ["workspaces"] as const,
	list: () => [...workspaceKeys.all, "list"] as const,
};

/**
 * Route params for linking to the current workspace, or null when the page sits
 * outside one (the picker itself, admin, the paywall).
 *
 * Null rather than an empty string: a caller that can't build a link needs to
 * render something else, and `/app/org//…` is not that.
 */
export function useWorkspaceParams(): { org: string } | null {
	const params = useParams({ strict: false }) as { org?: string };
	return params.org ? { org: params.org } : null;
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
	const params = useParams({ strict: false }) as { org?: string; brand?: string };
	return params.org && params.brand ? { org: params.org, brand: params.brand } : null;
}

/**
 * Every workspace the user belongs to, with its brands — the *other* workspaces
 * the switcher offers. The one being viewed comes from the route loader, so
 * callers surface `isLoading` and `isError` for what this adds on top rather
 * than letting a failed request empty the navigation.
 */
export function useWorkspaces() {
	const query = useQuery({
		queryKey: workspaceKeys.list(),
		queryFn: () => listWorkspacesFn(),
		staleTime: 60_000,
	});

	return {
		workspaces: (query.data ?? []) as WorkspaceWithBrands[],
		isLoading: query.isLoading,
		isError: query.isError,
		isFetching: query.isFetching,
		refetch: query.refetch,
	};
}
