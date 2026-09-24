import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { forgetPaywall } from "@/lib/billing/queries";
import { invalidateOrganizations, organizationsQuery } from "@/lib/organizations/queries";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { ORG_ROUTE_ID } from "@/lib/route-subject";

export function useOrganization(): OrganizationSummary {
	return useLoaderData({ from: ORG_ROUTE_ID, select: (data) => data.organization });
}

export function useOrganizations() {
	const query = useQuery(organizationsQuery);

	return {
		data: query.data?.organizations ?? [],
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		error: query.error,
		refetch: query.refetch,
	};
}

/**
 * The router resolves `/app/org/$org` against this cache, so a write that
 * changes what exists has to drop both or the next navigation reads a list that
 * predates it. The paywall answer goes with it: which organizations exist is
 * what it was computed from.
 */
export function useOrganizationsChanged(): (moveTo?: () => Promise<unknown>) => Promise<void> {
	const queryClient = useQueryClient();
	const router = useRouter();

	return useCallback(
		async (moveTo?: () => Promise<unknown>) => {
			await invalidateOrganizations(queryClient);
			forgetPaywall(queryClient);
			await moveTo?.();
			await router.invalidate();
		},
		[queryClient, router],
	);
}
