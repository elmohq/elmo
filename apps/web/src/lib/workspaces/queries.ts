/**
 * The `/app/org/$org` layout resolves the workspace in `beforeLoad`, which
 * re-runs on every navigation — filter changes included. The cache is what
 * keeps that from being a round trip each time, and what gives the mutations
 * that change a workspace something to invalidate.
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
	list: () => ({
		queryKey: workspaceKeys.list(),
		queryFn: () => listWorkspacesFn(),
		staleTime: STALE_TIME,
	}),
	/** Null when the user has no such workspace. */
	detail: (org: string) => ({
		queryKey: workspaceKeys.detail(org),
		queryFn: () => resolveWorkspaceFn({ data: { org } }),
		staleTime: STALE_TIME,
	}),
};

/**
 * Both queries go, not just the one the caller changed: the account menu lists
 * every workspace's brands, so a brand created in one is stale in the other.
 */
export function invalidateWorkspaces(queryClient: QueryClient): Promise<void> {
	return queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
}
