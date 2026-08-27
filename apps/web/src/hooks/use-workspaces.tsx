import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { listWorkspacesFn, type WorkspaceWithBrands } from "@/server/workspaces";

export const workspaceKeys = {
	all: ["workspaces"] as const,
	list: () => [...workspaceKeys.all, "list"] as const,
};

/**
 * The workspace slug in the URL. Every page under `/app/org/$org` has one; the
 * empty string stands for the handful that sit outside it (the picker itself,
 * admin, the paywall), where callers use it to build nothing.
 */
export function useOrgSlug(): string {
	const params = useParams({ strict: false }) as { org?: string };
	return params.org ?? "";
}

/**
 * The `$brand` segment of the current URL — the brand's slug where it has one
 * and its id otherwise.
 *
 * For linking, not for identifying: a component that needs to *name* the brand
 * to the server wants `useBrandId`. Linking with the segment already in the
 * address bar keeps navigation off the canonicalizing redirect.
 */
export function useBrandSlug(): string {
	const params = useParams({ strict: false }) as { brand?: string };
	return params.brand ?? "";
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
