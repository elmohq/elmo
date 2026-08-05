import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("./db", () => ({ db: database }));

import { syncMemberships } from "./auth-sync";

describe("syncMemberships", () => {
	beforeEach(() => {
		database.transaction.mockReset();
	});

	it("serializes whole-user reconciliation and reports one concurrent insertion", async () => {
		const memberships = new Set<string>();
		let lockTail = Promise.resolve();

		database.transaction.mockImplementation(async (run) => {
			let releaseLock = () => {};
			const tx = {
				execute: async () => {
					const previous = lockTail;
					lockTail = new Promise<void>((resolve) => {
						releaseLock = resolve;
					});
					await previous;
				},
				select: () => ({
					from: () => ({
						where: async () => [...memberships].map((organizationId) => ({ id: organizationId, organizationId })),
					}),
				}),
				insert: () => ({
					values: (row: { organizationId: string }) => ({
						onConflictDoNothing: () => ({
							returning: async () => {
								if (memberships.has(row.organizationId)) return [];
								memberships.add(row.organizationId);
								return [{ organizationId: row.organizationId }];
							},
						}),
					}),
				}),
				delete: vi.fn(),
			};
			try {
				return await run(tx);
			} finally {
				releaseLock();
			}
		});

		const results = await Promise.all([
			syncMemberships("user-a", ["org-b", "org-a"]),
			syncMemberships("user-a", ["org-a", "org-b"]),
		]);

		expect(results.flatMap((result) => result.added).sort()).toEqual(["org-a", "org-b"]);
		expect(results.every((result) => result.removed.length === 0)).toBe(true);
		expect([...memberships].sort()).toEqual(["org-a", "org-b"]);
	});
});
