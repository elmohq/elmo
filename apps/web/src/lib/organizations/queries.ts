/**
 * The `/app/org/$org` layout resolves the organization in `beforeLoad`, which
 * re-runs on every navigation — filter changes included. The cache is what
 * keeps that from being a round trip each time, and what gives the mutations
 * that change an organization something to invalidate.
 */
import type { QueryClient } from "@tanstack/react-query";
import { listOrganizationsFn, resolveOrganizationFn } from "@/server/organizations";

const organizationKeys = {
	all: ["organizations"] as const,
	list: () => [...organizationKeys.all, "list"] as const,
	detail: (org: string) => [...organizationKeys.all, "detail", org] as const,
};

const STALE_TIME = 60_000;

export const organizationQueries = {
	list: () => ({
		queryKey: organizationKeys.list(),
		queryFn: () => listOrganizationsFn(),
		staleTime: STALE_TIME,
	}),
	/** Null when the user has no such organization. */
	detail: (org: string) => ({
		queryKey: organizationKeys.detail(org),
		queryFn: () => resolveOrganizationFn({ data: { org } }),
		staleTime: STALE_TIME,
	}),
};

/**
 * Both queries go, not just the one the caller changed: the account menu lists
 * every organization's brands, so a brand created in one is stale in the other.
 */
export function invalidateOrganizations(queryClient: QueryClient): Promise<void> {
	return queryClient.invalidateQueries({ queryKey: organizationKeys.all });
}
