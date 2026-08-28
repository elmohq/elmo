import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { invalidateWorkspaces, workspaceQueries } from "@/lib/workspaces/queries";
import type { WorkspaceRouteContext, WorkspaceSummary } from "@/lib/workspaces/types";

/**
 * Read from the layout's loader data rather than its route context: a
 * `beforeLoad` re-runs on every navigation, and a component reading that result
 * directly would see `undefined` for as long as it takes.
 */
export function useWorkspaceRoute(): WorkspaceRouteContext {
	return useLoaderData({ from: "/_authed/app/org/$org" });
}

/**
 * Callers surface `isLoading` and `isError` rather than letting a failed
 * request empty the navigation.
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
