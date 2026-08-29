import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateOrganizations, organizationsQuery } from "@/lib/organizations/queries";

vi.mock("@/server/organizations", () => ({ listOrganizationsFn: vi.fn() }));

describe("invalidateOrganizations", () => {
	/**
	 * The router resolves `/app/org/$org` against this cache, and the pages that
	 * create an organization or a brand render outside the shell — so nothing is
	 * observing the query when they navigate. React Query's default only
	 * refetches observed queries, and `ensureQueryData` hands back retained data
	 * whatever its age: together that lands the caller on a list that predates
	 * their own write, and the route 404s.
	 */
	it("re-reads the list even with nothing observing it", async () => {
		const queryClient = new QueryClient();
		let answer = ["before"];
		const query = { ...organizationsQuery, queryFn: async () => answer };

		await queryClient.ensureQueryData(query);
		answer = ["after"];

		await invalidateOrganizations(queryClient);

		expect(await queryClient.ensureQueryData(query)).toEqual(["after"]);
	});
});
