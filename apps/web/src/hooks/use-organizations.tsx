import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { invalidateOrganizations, organizationQueries } from "@/lib/organizations/queries";
import type { OrganizationRouteContext, OrganizationSummary } from "@/lib/organizations/types";

/**
 * Read from the layout's loader data rather than its route context: a
 * `beforeLoad` re-runs on every navigation, and a component reading that result
 * directly would see `undefined` for as long as it takes.
 */
export function useOrganizationRoute(): OrganizationRouteContext {
	return useLoaderData({ from: "/_authed/app/org/$org" });
}

/**
 * Callers surface `isLoading` and `isError` rather than letting a failed
 * request empty the navigation.
 */
export function useOrganizations() {
	const query = useQuery(organizationQueries.list());

	return {
		organizations: (query.data ?? []) as OrganizationSummary[],
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
