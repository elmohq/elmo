import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	transaction: vi.fn(),
	lockOrganizationCapacity: vi.fn(),
}));

vi.mock("../db/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("./advisory-locks", () => ({ lockOrganizationCapacity: mocks.lockOrganizationCapacity }));

import { loadOrganizationEntitlementResolution } from "./entitlements";

function queryBuilder(result: unknown) {
	const builder: Record<string, unknown> = {};
	for (const method of ["from", "where", "innerJoin"]) builder[method] = () => builder;
	builder.limit = async () => result;
	builder.then = (
		resolve: (value: unknown) => unknown,
		reject: (reason: unknown) => unknown,
	) => Promise.resolve(result).then(resolve, reject);
	return builder;
}

describe("default organization entitlement source transaction", () => {
	beforeEach(() => {
		mocks.transaction.mockReset();
		mocks.lockOrganizationCapacity.mockReset();
	});

	it("takes the capacity lock before reading any source row", async () => {
		const operations: string[] = [];
		const selectResults = [[], [], [], []];
		const tx = {
			select: () => {
				operations.push("select");
				return queryBuilder(selectResults.shift() ?? []);
			},
		};
		mocks.lockOrganizationCapacity.mockImplementation(async () => {
			operations.push("lock");
		});
		mocks.transaction.mockImplementation(async (run: (transaction: unknown) => unknown) => run(tx));

		const result = await loadOrganizationEntitlementResolution({
			organizationId: "org-1",
			now: new Date("2026-08-05T00:00:00.000Z"),
		});

		expect(result.resolved).toMatchObject({ access: "denied", reason: "missing-subscription" });
		expect(mocks.transaction).toHaveBeenCalledOnce();
		expect(mocks.lockOrganizationCapacity).toHaveBeenCalledWith(tx, "org-1");
		expect(operations).toEqual(["lock", "select", "select", "select", "select"]);
	});
});
