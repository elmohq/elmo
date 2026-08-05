import { describe, expect, it, vi } from "vitest";
import {
	CUTOVER_LOCK_CONTENTION_EXIT_CODE,
	type CutoverLockWaitResult,
	DatabaseUpgradeCutoverLockUnavailableError,
	ELMO_UPGRADE_CUTOVER_LOCK_ID,
	holdDatabaseUpgradeCutoverLock,
} from "./cutover-lock.js";

function result(column: string, value: boolean): { rows: Record<string, boolean | string>[] } {
	return { rows: [{ [column]: value, backend: "101" }] };
}

describe("database upgrade cutover advisory lock", () => {
	it("fails fast with a stable contention exit code without publishing readiness", async () => {
		const client = {
			query: vi.fn(async () => result("acquired", false)),
		};
		const marker = {
			remove: vi.fn(async () => undefined),
			refresh: vi.fn(async () => undefined),
		};

		const holding = holdDatabaseUpgradeCutoverLock({
			client,
			marker,
			lifetime: {
				status: () => "running",
				waitForNextHealthCheck: vi.fn(async () => "stop" as const),
			},
		});

		await expect(holding).rejects.toMatchObject({
			name: "DatabaseUpgradeCutoverLockUnavailableError",
			exitCode: CUTOVER_LOCK_CONTENTION_EXIT_CODE,
		});
		expect(await holding.catch((error) => error)).toBeInstanceOf(DatabaseUpgradeCutoverLockUnavailableError);
		expect(client.query).toHaveBeenCalledWith(
			"select pg_backend_pid()::text as backend, pg_try_advisory_lock($1::bigint) as acquired",
			[ELMO_UPGRADE_CUTOVER_LOCK_ID],
		);
		expect(marker.remove).toHaveBeenCalledTimes(1);
		expect(marker.refresh).not.toHaveBeenCalled();
	});

	it("publishes readiness only after health checks and unlocks on a clean stop", async () => {
		const calls: string[] = [];
		const client = {
			query: vi.fn(async (query: string) => {
				if (query.includes("try_advisory")) {
					calls.push("acquire");
					return result("acquired", true);
				}
				if (query.includes("advisory_unlock")) {
					calls.push("unlock");
					return result("released", true);
				}
				calls.push("health");
				return { rows: [{ backend: "101" }] };
			}),
		};
		const marker = {
			remove: vi.fn(async () => {
				calls.push("remove");
			}),
			refresh: vi.fn(async () => {
				calls.push("refresh");
			}),
		};
		const waits: CutoverLockWaitResult[] = ["health-check", "stop"];

		await holdDatabaseUpgradeCutoverLock({
			client,
			marker,
			lifetime: {
				status: () => "running",
				waitForNextHealthCheck: vi.fn(async () => waits.shift() ?? "stop"),
			},
		});

		expect(calls).toEqual(["remove", "acquire", "health", "refresh", "health", "refresh", "remove", "unlock"]);
	});

	it("withholds source-fence readiness through the full quiescence health window", async () => {
		const calls: string[] = [];
		const client = {
			query: vi.fn(async (query: string, values?: unknown[]) => {
				if (query.includes("try_advisory")) {
					calls.push(`acquire:${String(values?.[0])}`);
					return result("acquired", true);
				}
				if (query.includes("advisory_unlock")) return result("released", true);
				calls.push("health");
				return { rows: [{ backend: "101" }] };
			}),
		};
		const marker = {
			remove: vi.fn(async () => undefined),
			refresh: vi.fn(async () => {
				calls.push("ready");
			}),
		};
		let waits = 0;
		await holdDatabaseUpgradeCutoverLock({
			client,
			lockId: "42",
			marker,
			readinessHealthChecks: 3,
			lifetime: {
				status: () => "running",
				waitForNextHealthCheck: vi.fn(async () => {
					waits += 1;
					return waits <= 3 ? "health-check" : "stop";
				}),
			},
		});

		expect(calls.slice(0, 8)).toEqual(["acquire:42", "health", "health", "health", "health", "ready"]);
		expect(marker.refresh).toHaveBeenCalledOnce();
	});

	it("removes readiness and preserves a periodic health-check failure", async () => {
		const connectionFailure = new Error("database connection lost");
		const unlockFailure = new Error("cannot unlock a dead session");
		const client = {
			query: vi
				.fn()
				.mockResolvedValueOnce(result("acquired", true))
				.mockResolvedValueOnce({ rows: [{ backend: "101" }] })
				.mockRejectedValueOnce(connectionFailure)
				.mockRejectedValueOnce(unlockFailure),
		};
		const marker = {
			remove: vi.fn(async () => undefined),
			refresh: vi.fn(async () => undefined),
		};

		await expect(
			holdDatabaseUpgradeCutoverLock({
				client,
				marker,
				lifetime: {
					status: () => "running",
					waitForNextHealthCheck: vi.fn(async () => "health-check" as const),
				},
			}),
		).rejects.toBe(connectionFailure);
		expect(marker.refresh).toHaveBeenCalledTimes(1);
		expect(marker.remove).toHaveBeenCalledTimes(2);
		expect(client.query).toHaveBeenCalledTimes(4);
	});

	it("never publishes readiness when the initial health query fails", async () => {
		const connectionFailure = new Error("connection closed after acquiring the lock");
		const client = {
			query: vi
				.fn()
				.mockResolvedValueOnce(result("acquired", true))
				.mockRejectedValueOnce(connectionFailure)
				.mockRejectedValueOnce(connectionFailure),
		};
		const marker = {
			remove: vi.fn(async () => undefined),
			refresh: vi.fn(async () => undefined),
		};

		await expect(
			holdDatabaseUpgradeCutoverLock({
				client,
				marker,
				lifetime: {
					status: () => "running",
					waitForNextHealthCheck: vi.fn(async () => "stop" as const),
				},
			}),
		).rejects.toBe(connectionFailure);
		expect(marker.refresh).not.toHaveBeenCalled();
		expect(marker.remove).toHaveBeenCalledTimes(2);
	});

	it("fails closed before readiness when the lock session changes backend", async () => {
		const client = {
			query: vi
				.fn()
				.mockResolvedValueOnce(result("acquired", true))
				.mockResolvedValueOnce({ rows: [{ backend: "202" }] })
				.mockResolvedValueOnce(result("released", false)),
		};
		const marker = {
			remove: vi.fn(async () => undefined),
			refresh: vi.fn(async () => undefined),
		};
		await expect(
			holdDatabaseUpgradeCutoverLock({
				client,
				marker,
				lifetime: {
					status: () => "running",
					waitForNextHealthCheck: vi.fn(async () => "stop" as const),
				},
			}),
		).rejects.toThrow(/changed PostgreSQL backends/);
		expect(marker.refresh).not.toHaveBeenCalled();
	});
});
