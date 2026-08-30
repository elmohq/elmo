import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
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

export function useInvalidateOrganizations(): () => Promise<void> {
	const queryClient = useQueryClient();
	return () => invalidateOrganizations(queryClient);
}
