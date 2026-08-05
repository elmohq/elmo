import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	transaction: vi.fn(),
	lockOrganizationCapacity: vi.fn(),
}));

vi.mock("../db/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("./advisory-locks", () => ({ lockOrganizationCapacity: mocks.lockOrganizationCapacity }));

import { withOrganizationEntitlementTransaction } from "./capacity";

describe("noncloud entitlement transactions", () => {
	beforeEach(() => {
		mocks.transaction.mockReset();
		mocks.lockOrganizationCapacity.mockReset();
	});

	it.each(["local", "demo", "whitelabel"] as const)(
		"does not read cloud billing state in %s mode",
		async (mode) => {
			const tx = {
				select: vi.fn(() => {
					throw new Error("noncloud transaction attempted to read a cloud projection");
				}),
			};
			mocks.transaction.mockImplementation(async (run: (transaction: unknown) => unknown) => run(tx));
			const run = vi.fn(async ({ resolved }) => resolved);

			const result = await withOrganizationEntitlementTransaction({
				mode,
				organizationId: "legacy-org",
				run,
			});

			expect(mocks.lockOrganizationCapacity).toHaveBeenCalledWith(tx, "legacy-org");
			expect(tx.select).not.toHaveBeenCalled();
			expect(run).toHaveBeenCalledOnce();
			expect(result).toMatchObject({ mode, access: "allowed", source: { kind: "legacy" } });
		},
	);
});
