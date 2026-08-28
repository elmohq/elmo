import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { invalidateWorkspaces, workspaceQueries } from "@/lib/workspaces/queries";
import type { WorkspaceRouteContext, WorkspaceSummary } from "@/lib/workspaces/types";

/**
 * The workspace this page belongs to, as the `/app/org/$org` layout resolved it.
 *
 * Read from that layout's loader data rather than from route context: a
 * `beforeLoad` re-runs on every navigation, and a component reading its result
 * directly would see `undefined` for as long as that takes.
 */
export function useWorkspaceRoute(): WorkspaceRouteContext {
	return useLoaderData({ from: "/_authed/app/org/$org" });
}

/**
 * Every workspace the user belongs to, with its brands — the *other* workspaces
 * the switcher offers. The one being viewed comes from the route loader, so
 * callers surface `isLoading` and `isError` for what this adds on top rather
 * than letting a failed request empty the navigation.
 */
export function useWorkspaces() {
	const query = useQuery(workspaceQueries.list());

	return {
		workspaces: (query.data ?? []) as WorkspaceSummary[],
		isLoading: query.isLoading,
		isError: query.isError,
		isFetching: query.isFetching,
		refetch: query.refetch,
	};
}

/** Drop every cached answer about workspaces, after changing one. */
export function useInvalidateWorkspaces(): () => Promise<void> {
	const queryClient = useQueryClient();
	return () => invalidateWorkspaces(queryClient);
}
