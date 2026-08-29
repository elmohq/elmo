import type { QueryClient } from "@tanstack/react-query";
import { listOrganizationsFn } from "@/server/organizations";

/**
 * One query for every organization surface: the account menu, the directory,
 * the 404's directory, and the `/app/org/$org` layout that resolves its segment
 * against it. `beforeLoad` re-runs on every navigation — filter changes
 * included — and the cache is what keeps that from being a round trip each
 * time.
 */
export const organizationsQuery = {
	queryKey: ["organizations"] as const,
	queryFn: () => listOrganizationsFn(),
	staleTime: 60_000,
	// The 404 renders for signed-out callers too, and retrying tells them nothing.
	retry: false,
};

/** After changing an organization or one of its brands. */
export function invalidateOrganizations(queryClient: QueryClient): Promise<void> {
	return queryClient.invalidateQueries({ queryKey: organizationsQuery.queryKey });
}
