import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	transaction: vi.fn(),
	lockOrganizationCapacity: vi.fn(),
	resolveOrganizationEntitlements: vi.fn(),
	createOrganizationEntitlementSourceStore: vi.fn(() => ({})),
}));

vi.mock("../db/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("./advisory-locks", () => ({ lockOrganizationCapacity: mocks.lockOrganizationCapacity }));
vi.mock("./entitlements", () => ({
	createOrganizationEntitlementSourceStore: mocks.createOrganizationEntitlementSourceStore,
	resolveOrganizationEntitlements: mocks.resolveOrganizationEntitlements,
}));

import { EntitlementAccessError, withOrganizationEntitlementTransaction } from "./capacity";

describe("organization entitlement transaction", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const tx = {};
		mocks.transaction.mockImplementation(async (run: (transaction: unknown) => unknown) => run(tx));
	});

	it("locks before rechecking access and never starts a denied mutation", async () => {
		const operations: string[] = [];
		mocks.lockOrganizationCapacity.mockImplementation(async () => {
			operations.push("lock");
		});
		mocks.resolveOrganizationEntitlements.mockImplementation(async () => {
			operations.push("resolve");
			return { mode: "cloud", access: "denied", reason: "missing-subscription" };
		});
		const run = vi.fn();

		await expect(
			withOrganizationEntitlementTransaction({ mode: "cloud", organizationId: "org-a", run }),
		).rejects.toEqual(new EntitlementAccessError("missing-subscription"));

		expect(operations).toEqual(["lock", "resolve"]);
		expect(mocks.lockOrganizationCapacity).toHaveBeenCalledWith(expect.anything(), "org-a");
		expect(mocks.createOrganizationEntitlementSourceStore).toHaveBeenCalledOnce();
		expect(run).not.toHaveBeenCalled();
	});
});
