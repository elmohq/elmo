import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { invalidateOrganizations, organizationsQuery } from "@/lib/organizations/queries";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { ORG_ROUTE_ID } from "@/lib/route-subject";

export function useOrganization(): OrganizationSummary {
	return useRouteContext({ from: ORG_ROUTE_ID, select: (context) => context.organization });
}

export function useOrganizations() {
	const query = useQuery(organizationsQuery);

	return {
		organizations: query.data?.organizations ?? [],
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
export function useOrganizationsChanged(): (moveTo?: () => Promise<unknown>) => Promise<void> {
	const queryClient = useQueryClient();
	const router = useRouter();

	return useCallback(
		async (moveTo?: () => Promise<unknown>) => {
			await invalidateOrganizations(queryClient);
			await moveTo?.();
			await router.invalidate();
		},
		[queryClient, router],
	);
}
