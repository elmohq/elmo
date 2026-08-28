/**
 * How the app asks for workspaces, in one place.
 *
 * The `/app/org/$org` layout resolves the workspace in `beforeLoad`, which the
 * router re-runs on every navigation — filter changes included. Going through
 * the query cache is what keeps that from being a round trip each time, and it
 * is also what gives the mutations that change a workspace something to
 * invalidate: the rail's switcher and the layout then refresh together instead
 * of the switcher holding a stale name for a minute.
 */
import type { QueryClient } from "@tanstack/react-query";
import { listWorkspacesFn, resolveWorkspaceFn } from "@/server/workspaces";

export const workspaceKeys = {
	all: ["workspaces"] as const,
	list: () => [...workspaceKeys.all, "list"] as const,
	detail: (org: string) => [...workspaceKeys.all, "detail", org] as const,
};

const STALE_TIME = 60_000;

export const workspaceQueries = {
	/** Every workspace the user belongs to — what the switcher and `/app` render. */
	list: () => ({
		queryKey: workspaceKeys.list(),
		queryFn: () => listWorkspacesFn(),
		staleTime: STALE_TIME,
	}),
	/** The workspace an `$org` segment names, or null when the user has no such one. */
	detail: (org: string) => ({
		queryKey: workspaceKeys.detail(org),
		queryFn: () => resolveWorkspaceFn({ data: { org } }),
		staleTime: STALE_TIME,
	}),
};

/**
 * Everything anyone knows about workspaces is now out of date: a brand was
 * created, or a workspace was renamed or moved to a new URL.
 *
 * Both queries go, not just the one the caller changed — the switcher lists
 * every workspace's brands, so a brand created in one is stale in the other.
 */
export function invalidateWorkspaces(queryClient: QueryClient): Promise<void> {
	return queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
}
