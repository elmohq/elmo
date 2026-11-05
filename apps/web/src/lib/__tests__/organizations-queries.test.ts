import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateOrganizations, organizationsQuery } from "@/lib/organizations/queries";

vi.mock("@/server/organizations", () => ({ listOrganizationsFn: vi.fn() }));

describe("invalidateOrganizations", () => {
	it("re-reads the list even with nothing observing it", async () => {
		const queryClient = new QueryClient();
		let answer = { signedIn: true, organizations: ["before"] };
		const query = { ...organizationsQuery, queryFn: async () => answer };

		await queryClient.ensureQueryData(query);
		answer = { signedIn: true, organizations: ["after"] };

		await invalidateOrganizations(queryClient);

		expect(await queryClient.ensureQueryData(query)).toEqual({ signedIn: true, organizations: ["after"] });
	});
});
