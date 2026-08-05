import { describe, expect, it, vi } from "vitest";
import { ELMO_MIGRATION_LOCK_ID, withDatabaseMigrationLock } from "./migration-lock.js";

describe("database migration advisory lock", () => {
	it("holds one database-global lock around the entire migration", async () => {
		const calls: string[] = [];
		const client = {
			query: vi.fn(async (query: string, values?: unknown[]) => {
				calls.push(query.includes("unlock") ? "unlock" : "lock");
				expect(values).toEqual([ELMO_MIGRATION_LOCK_ID]);
				return { rows: [{ backend: "101", ...(query.includes("unlock") ? { released: true } : {}) }] };
			}),
		};

		await withDatabaseMigrationLock(client, async () => {
			calls.push("migrate");
		});

		expect(calls).toEqual(["lock", "migrate", "unlock"]);
	});

	it("releases the database lock when migration fails", async () => {
		const client = {
			query: vi.fn(async (query: string) => ({
				rows: [{ backend: "101", ...(query.includes("unlock") ? { released: true } : {}) }],
			})),
		};
		await expect(
			withDatabaseMigrationLock(client, async () => {
				throw new Error("migration failed");
			}),
		).rejects.toThrow(/migration failed/);
		expect(client.query).toHaveBeenCalledTimes(2);
	});

	it("preserves the migration failure if unlocking also fails", async () => {
		const client = {
			query: vi
				.fn()
				.mockResolvedValueOnce({ rows: [{ backend: "101" }] })
				.mockRejectedValueOnce(new Error("connection lost while unlocking")),
		};
		const migrationFailure = new Error("migration failed");

		await expect(withDatabaseMigrationLock(client, async () => Promise.reject(migrationFailure))).rejects.toBe(
			migrationFailure,
		);
	});
});
