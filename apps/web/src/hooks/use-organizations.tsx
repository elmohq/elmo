import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useRouter } from "@tanstack/react-router";
import { invalidateOrganizations, organizationsQuery } from "@/lib/organizations/queries";
import type { OrganizationSummary } from "@/lib/organizations/types";

export function useOrganization(): OrganizationSummary {
	return useLoaderData({ from: "/_authed/app/org/$org" });
}

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

/**
 * The router resolves `/app/org/$org` against this cache, so a write that
 * changes what exists has to drop both or the next navigation reads a list that
 * predates it.
 */
export function useInvalidateOrganizations(): () => Promise<void> {
	const queryClient = useQueryClient();
	const router = useRouter();
	return async () => {
		await invalidateOrganizations(queryClient);
		await router.invalidate();
	};
}
