import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateOrganizations, organizationsQuery } from "@/lib/organizations/queries";

vi.mock("@/server/organizations", () => ({ listOrganizationsFn: vi.fn() }));

describe("invalidateOrganizations", () => {
	// React Query's default only refetches observed queries — see
	// `invalidateOrganizations` for why that 404s a caller after its own write.
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
