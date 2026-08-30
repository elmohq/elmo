import type { QueryClient } from "@tanstack/react-query";
import { listOrganizationsFn } from "@/server/organizations";

/**
 * One query for every organization surface, including the `/app/org/$org`
 * layout that resolves its segment against it. That `beforeLoad` re-runs on
 * every navigation, filter changes included, so the cache is what keeps it from
 * being a round trip each time.
 */
export const organizationsQuery = {
	queryKey: ["organizations"] as const,
	queryFn: () => listOrganizationsFn(),
	staleTime: 60_000,
};

/**
 * `refetchType: "all"`, not the default: the pages that create an organization
 * or a brand render outside the shell, so nothing is observing this query when
 * they navigate and the default would mark it stale without re-reading it.
 * `ensureQueryData` then hands back the retained list whatever its age, and
 * `/app/org/$org` 404s on a list that predates the caller's own write.
 */
export function invalidateOrganizations(queryClient: QueryClient): Promise<void> {
	return queryClient.invalidateQueries({ queryKey: organizationsQuery.queryKey, refetchType: "all" });
}
