import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { invalidateOrganizations, organizationsQuery } from "@/lib/organizations/queries";
import type { OrganizationSummary } from "@/lib/organizations/types";

/**
 * The organization the page is inside, as the `/app/org/$org` layout resolved
 * it. Read from loader data rather than route context: a `beforeLoad` re-runs
 * on every navigation, and a component reading that result directly would see
 * `undefined` for as long as it takes.
 */
export function useOrganization(): OrganizationSummary {
	return useLoaderData({ from: "/_authed/app/org/$org" });
}

/**
 * Callers surface `isLoading` and `isError` rather than letting a failed
 * request empty the navigation.
 */
export function useOrganizations() {
	const query = useQuery(organizationsQuery);

	return {
		organizations: query.data ?? [],
		isLoading: query.isLoading,
		isError: query.isError,
		isFetching: query.isFetching,
		refetch: query.refetch,
	};
}

/** Drop every cached answer about organizations, after changing one. */
export function useInvalidateOrganizations(): () => Promise<void> {
	const queryClient = useQueryClient();
	return () => invalidateOrganizations(queryClient);
}
