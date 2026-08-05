import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("./db", () => ({ db: database }));

import { syncMemberships } from "./auth-sync";

describe("syncMemberships", () => {
	beforeEach(() => {
		database.transaction.mockReset();
	});

	it("makes concurrent reconciliation idempotent and only reports the inserted membership", async () => {
		let membershipExists = false;
		let readers = 0;
		let releaseReaders: (() => void) | undefined;
		const bothReadersStarted = new Promise<void>((resolve) => {
			releaseReaders = resolve;
		});

		const tx = {
			select: () => ({
				from: () => ({
					where: async () => {
						readers++;
						if (readers === 2) releaseReaders?.();
						await bothReadersStarted;
						return [];
					},
				}),
			}),
			insert: () => ({
				values: (row: { organizationId: string }) => ({
					onConflictDoNothing: () => ({
						returning: async () => {
							if (membershipExists) return [];
							membershipExists = true;
							return [{ organizationId: row.organizationId }];
						},
					}),
				}),
			}),
			delete: vi.fn(),
		};
		database.transaction.mockImplementation(async (run) => run(tx));

		const results = await Promise.all([
			syncMemberships("user-a", ["org-a"]),
			syncMemberships("user-a", ["org-a"]),
		]);

		expect(results.flatMap((result) => result.added)).toEqual(["org-a"]);
		expect(results.every((result) => result.removed.length === 0)).toBe(true);
		expect(membershipExists).toBe(true);
	});
});
