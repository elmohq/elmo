import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import type { QueryConfig } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import migrationJournal from "./db/migrations/meta/_journal.json";
import {
	type DeploymentCutoverParticipantClient,
	deploymentRuntimeFenceLockId,
	ELMO_RUNTIME_ALLOWED_MIGRATION_TIMESTAMPS,
	ELMO_RUNTIME_FENCE_GENERATION,
	ELMO_UPGRADE_CUTOVER_LOCK_ID,
	resolveDeploymentRuntimeFenceConfig,
	startDeploymentCutoverParticipantSession,
} from "./deployment-cutover";

const GENERATION = "0020";
const MIGRATION_TIMESTAMP = "1785915298354";
const BACKEND_PID = "4242";
const IDENTITY_LOCK_QUERY =
	'select pg_backend_pid()::text as "backendPid", pg_try_advisory_lock($1::bigint) as acquired';
const IDENTITY_UNLOCK_QUERY =
	'select pg_backend_pid()::text as "backendPid", pg_advisory_unlock($1::bigint) as released';
const UNLOCK_QUERY = 'select pg_advisory_unlock_shared($1::bigint) as released, pg_backend_pid()::text as "backendPid"';

function deferred<T>(): {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
}

function queryText(query: string | QueryConfig): string {
	return typeof query === "string" ? query : query.text;
}

class FakeClient extends EventEmitter implements DeploymentCutoverParticipantClient {
	readonly calls: string[] = [];
	runtimeGenerationError: Error | undefined;
	runtimeGenerationRows: Record<string, unknown>[] = [{ backendPid: BACKEND_PID, runtimeGeneration: GENERATION }];
	readonly connect = vi.fn(async () => {
		this.calls.push("connect");
	});
	readonly end = vi.fn(async () => {
		this.calls.push("end");
	});
	readonly query = vi.fn(async (query: string | QueryConfig, _values?: unknown[]): Promise<unknown> => {
		const text = queryText(query);
		if (text.includes("advisory_lock_shared")) {
			this.calls.push("lock");
			return { rows: [{ backendPid: BACKEND_PID }] };
		}
		if (text.includes("pg_try_advisory_lock(")) {
			this.calls.push("identity-lock");
			return { rows: [{ acquired: true, backendPid: BACKEND_PID }] };
		}
		if (text.includes("pg_advisory_unlock(")) {
			this.calls.push("identity-unlock");
			return { rows: [{ backendPid: BACKEND_PID, released: true }] };
		}
		if (text.includes("__drizzle_migrations") && !text.includes("select 1 as healthy")) {
			this.calls.push("attest");
			return { rows: [{ backendPid: BACKEND_PID, migrationTimestamp: MIGRATION_TIMESTAMP }] };
		}
		if (text.includes("select 1 as healthy")) {
			this.calls.push("health");
			return {
				rows: [
					{
						backendPid: BACKEND_PID,
						healthy: 1,
						migrationTimestamp: MIGRATION_TIMESTAMP,
						runtimeGeneration: GENERATION,
					},
				],
			};
		}
		if (text.includes("elmo_runtime_generation")) {
			this.calls.push("attest-generation");
			if (this.runtimeGenerationError) throw this.runtimeGenerationError;
			return { rows: this.runtimeGenerationRows };
		}
		if (text.includes("advisory_unlock_shared")) {
			this.calls.push("unlock");
			return { rows: [{ backendPid: BACKEND_PID, released: true }] };
		}
		throw new Error(`Unexpected query: ${text}`);
	});
}

function startSession(
	client: FakeClient,
	onFatal = vi.fn(),
	verifyApplicationDatabaseScope: (lockId: string) => Promise<void> = vi.fn(async () => undefined),
) {
	return startDeploymentCutoverParticipantSession({
		allowedMigrationTimestamps: [MIGRATION_TIMESTAMP],
		client,
		fenceGeneration: GENERATION,
		healthCheckIntervalMs: 60_000,
		onFatal,
		queryTimeoutMs: 500,
		verifyApplicationDatabaseScope: async (lockId) => {
			client.calls.push("verify-application-scope");
			await verifyApplicationDatabaseScope(lockId);
		},
	});
}

afterEach(() => {
	vi.useRealTimers();
});

describe("deployment runtime cutover participant", () => {
	it("keeps the compiled runtime profile aligned with the latest migration journal entry", () => {
		const latestMigration = migrationJournal.entries.at(-1);
		expect(latestMigration?.tag.split("_")[0]).toBe(ELMO_RUNTIME_FENCE_GENERATION);
		expect(ELMO_RUNTIME_ALLOWED_MIGRATION_TIMESTAMPS).toEqual([String(latestMigration?.when)]);
	});

	it("keeps release images and publication metadata aligned with the runtime profile", async () => {
		const [dockerfile, releaseWorkflow, cliCompatibility] = await Promise.all([
			readFile(new URL("../../../docker/Dockerfile", import.meta.url), "utf8"),
			readFile(new URL("../../../.github/workflows/publish.yaml", import.meta.url), "utf8"),
			readFile(new URL("../../../apps/cli/src/rollback-compatibility.ts", import.meta.url), "utf8"),
		]);
		const imageLabels = [...dockerfile.matchAll(/LABEL com\.elmohq\.elmo\.runtime-fence-generation="([^"]+)"/g)].map(
			(match) => match[1],
		);
		const imageEnvironments = [...dockerfile.matchAll(/ENV ELMO_RUNTIME_FENCE_GENERATION="([^"]+)"/g)].map(
			(match) => match[1],
		);
		const imageMarkers = [
			...dockerfile.matchAll(/RUN printf '([^']+)\\n' > \/app\/\.elmo-runtime-fence-generation/g),
		].map((match) => match[1]);
		const workflowGeneration = releaseWorkflow.match(/SCHEMA_COMPATIBILITY:\s*"([^"]+)"/)?.[1];
		const cliGeneration = cliCompatibility.match(/CLOUD_SCHEMA_COMPATIBILITY = "([^"]+)"/)?.[1];

		expect(imageLabels).toEqual(Array.from({ length: 3 }, () => ELMO_RUNTIME_FENCE_GENERATION));
		expect(imageEnvironments).toEqual(Array.from({ length: 2 }, () => ELMO_RUNTIME_FENCE_GENERATION));
		expect(imageMarkers).toEqual(Array.from({ length: 2 }, () => ELMO_RUNTIME_FENCE_GENERATION));
		expect(workflowGeneration).toBe(ELMO_RUNTIME_FENCE_GENERATION);
		expect(cliGeneration).toBe(ELMO_RUNTIME_FENCE_GENERATION);
	});

	it("leaves source development unfenced unless it explicitly opts in", () => {
		expect(resolveDeploymentRuntimeFenceConfig({ environment: { DEPLOYMENT_MODE: "local" } })).toBeUndefined();
		expect(
			resolveDeploymentRuntimeFenceConfig({
				environment: {
					DATABASE_URL: "postgres://user@localhost/elmo",
					DATABASE_URL_UNPOOLED: "postgres://user@localhost/elmo",
					ELMO_RUNTIME_FENCE_GENERATION,
				},
			}),
		).toEqual({
			allowedMigrationTimestamps: ELMO_RUNTIME_ALLOWED_MIGRATION_TIMESTAMPS,
			applicationConnectionString: "postgres://user@localhost/elmo",
			connectionString: "postgres://user@localhost/elmo",
			fenceGeneration: ELMO_RUNTIME_FENCE_GENERATION,
		});
	});

	it("requires source-deployed cloud runtimes to opt into the compiled fence generation", () => {
		expect(() =>
			resolveDeploymentRuntimeFenceConfig({
				environment: {
					DATABASE_URL: "postgres://user@localhost/elmo",
					DATABASE_URL_UNPOOLED: "postgres://user@localhost/elmo",
					DEPLOYMENT_MODE: "cloud",
				},
			}),
		).toThrow(/ELMO_RUNTIME_FENCE_GENERATION must be 0020/);
		expect(
			resolveDeploymentRuntimeFenceConfig({
				environment: {
					DATABASE_URL: "postgres://user@localhost/elmo",
					DATABASE_URL_UNPOOLED: "postgres://user@localhost/elmo",
					DEPLOYMENT_MODE: "cloud",
					ELMO_RUNTIME_FENCE_GENERATION,
				},
			}),
		).toMatchObject({ fenceGeneration: ELMO_RUNTIME_FENCE_GENERATION });
	});

	it("does not allow a published image marker to be bypassed or drift from its profile", () => {
		expect(() =>
			resolveDeploymentRuntimeFenceConfig({ environment: {}, markerGeneration: `${ELMO_RUNTIME_FENCE_GENERATION}\n` }),
		).toThrow(/ELMO_RUNTIME_FENCE_GENERATION/);
		expect(() =>
			resolveDeploymentRuntimeFenceConfig({
				environment: { ELMO_RUNTIME_FENCE_GENERATION },
				markerGeneration: `${ELMO_RUNTIME_FENCE_GENERATION}\n`,
			}),
		).toThrow(/DATABASE_URL is required/);
		expect(() =>
			resolveDeploymentRuntimeFenceConfig({
				environment: {
					DATABASE_URL: "postgres://user@localhost/elmo",
					ELMO_RUNTIME_FENCE_GENERATION,
				},
				markerGeneration: `${ELMO_RUNTIME_FENCE_GENERATION}\n`,
			}),
		).toThrow(/DATABASE_URL_UNPOOLED/);
		expect(() =>
			resolveDeploymentRuntimeFenceConfig({
				environment: {
					DATABASE_URL: "postgres://user@localhost/elmo",
					DATABASE_URL_UNPOOLED: "postgres://user@pooler.example:6543/elmo",
					ELMO_RUNTIME_FENCE_GENERATION,
				},
			}),
		).toThrow(/transaction pooler/);
		expect(() =>
			resolveDeploymentRuntimeFenceConfig({
				environment: {
					DATABASE_URL: "postgres://user@localhost/elmo",
					DATABASE_URL_UNPOOLED: "postgres://user@localhost/elmo",
					ELMO_RUNTIME_FENCE_GENERATION,
				},
				markerGeneration: "0021\n",
			}),
		).toThrow(/marker must be 0020/);
	});

	it("derives stable generation-scoped keys outside the upgrade controller lock", () => {
		expect(deploymentRuntimeFenceLockId("0020")).toBe("6412217795039018216");
		expect(deploymentRuntimeFenceLockId("pre-0020")).not.toBe(deploymentRuntimeFenceLockId("0020"));
		expect(deploymentRuntimeFenceLockId("0020")).not.toBe(ELMO_UPGRADE_CUTOVER_LOCK_ID);
		expect(() => deploymentRuntimeFenceLockId("../../0020")).toThrow(/generation/);
	});

	it("does not publish startup readiness until the shared fence and journal attestation complete", async () => {
		const lock = deferred<unknown>();
		const applicationScopeProof = deferred<void>();
		const verifyApplicationDatabaseScope = vi.fn<(lockId: string) => Promise<void>>(
			() => applicationScopeProof.promise,
		);
		const client = new FakeClient();
		client.query.mockImplementation(async (query: string | QueryConfig) => {
			const text = queryText(query);
			if (text.includes("advisory_lock_shared")) {
				client.calls.push("lock");
				return lock.promise;
			}
			if (text.includes("pg_try_advisory_lock(")) {
				client.calls.push("identity-lock");
				return { rows: [{ acquired: true, backendPid: BACKEND_PID }] };
			}
			if (text.includes("pg_advisory_unlock(")) {
				client.calls.push("identity-unlock");
				return { rows: [{ backendPid: BACKEND_PID, released: true }] };
			}
			if (text.includes("__drizzle_migrations")) {
				client.calls.push("attest");
				return { rows: [{ backendPid: BACKEND_PID, migrationTimestamp: MIGRATION_TIMESTAMP }] };
			}
			if (text.includes("elmo_runtime_generation")) {
				client.calls.push("attest-generation");
				return { rows: [{ backendPid: BACKEND_PID, runtimeGeneration: GENERATION }] };
			}
			client.calls.push("unlock");
			return { rows: [{ backendPid: BACKEND_PID, released: true }] };
		});

		let ready = false;
		const starting = startSession(client, vi.fn(), verifyApplicationDatabaseScope).then((participant) => {
			ready = true;
			return participant;
		});
		await vi.waitFor(() => expect(client.calls).toEqual(["connect", "lock"]));
		expect(ready).toBe(false);
		expect(client.calls).not.toContain("attest");

		lock.resolve({ rows: [{ backendPid: BACKEND_PID }] });
		await vi.waitFor(() =>
			expect(client.calls).toEqual(["connect", "lock", "identity-lock", "verify-application-scope"]),
		);
		expect(ready).toBe(false);
		expect(client.calls).not.toContain("attest");
		const identityLockId = verifyApplicationDatabaseScope.mock.calls[0]?.[0];
		expect(identityLockId).toMatch(/^[0-9]+$/);
		expect(identityLockId).not.toBe(deploymentRuntimeFenceLockId(GENERATION));
		expect(client.query).toHaveBeenCalledWith(IDENTITY_LOCK_QUERY, [identityLockId]);
		applicationScopeProof.resolve();
		const participant = await starting;
		expect(client.calls).toEqual([
			"connect",
			"lock",
			"identity-lock",
			"verify-application-scope",
			"identity-unlock",
			"attest",
			"attest-generation",
		]);
		expect(ready).toBe(true);
		expect(client.query).toHaveBeenCalledWith(IDENTITY_UNLOCK_QUERY, [identityLockId]);
		await participant.stop();
	});

	it("releases both direct locks when the application database identity proof fails", async () => {
		const client = new FakeClient();
		const identityFailure = new Error("application URL resolved to another database");

		await expect(
			startSession(
				client,
				vi.fn(),
				vi.fn(async () => Promise.reject(identityFailure)),
			),
		).rejects.toBe(identityFailure);
		expect(client.calls).toEqual([
			"connect",
			"lock",
			"identity-lock",
			"verify-application-scope",
			"identity-unlock",
			"unlock",
			"end",
		]);
		expect(client.calls).not.toContain("attest");
	});

	it("fails closed and releases its fence when the database generation is not allowed", async () => {
		const client = new FakeClient();
		client.query.mockImplementation(async (query: string | QueryConfig) => {
			const text = queryText(query);
			if (text.includes("advisory_lock_shared")) return { rows: [{ backendPid: BACKEND_PID }] };
			if (text.includes("pg_try_advisory_lock(")) {
				return { rows: [{ acquired: true, backendPid: BACKEND_PID }] };
			}
			if (text.includes("pg_advisory_unlock(")) {
				return { rows: [{ backendPid: BACKEND_PID, released: true }] };
			}
			if (text.includes("__drizzle_migrations")) {
				return { rows: [{ backendPid: BACKEND_PID, migrationTimestamp: "1785916000000" }] };
			}
			return { rows: [{ backendPid: BACKEND_PID, released: true }] };
		});
		const onFatal = vi.fn();

		await expect(startSession(client, onFatal)).rejects.toThrow(/not compatible.*0020/);
		expect(client.query).toHaveBeenNthCalledWith(5, UNLOCK_QUERY, [deploymentRuntimeFenceLockId(GENERATION)]);
		expect(client.end).toHaveBeenCalledOnce();
		expect(onFatal).not.toHaveBeenCalled();
	});

	it.each([
		{ name: "missing", rows: [] },
		{
			name: "duplicated",
			rows: [
				{ backendPid: BACKEND_PID, runtimeGeneration: GENERATION },
				{ backendPid: BACKEND_PID, runtimeGeneration: GENERATION },
			],
		},
		{ name: "rolled back", rows: [{ backendPid: BACKEND_PID, runtimeGeneration: "pre-0020" }] },
	])("fails closed when the database runtime generation is $name", async ({ rows }) => {
		const client = new FakeClient();
		client.runtimeGenerationRows = rows;

		await expect(startSession(client)).rejects.toThrow(/runtime generation|one row/);
		expect(client.calls.at(-2)).toBe("unlock");
		expect(client.calls.at(-1)).toBe("end");
	});

	it("fails closed when the runtime generation table cannot be read", async () => {
		const client = new FakeClient();
		const databaseFailure = Object.assign(new Error("relation does not exist"), { code: "42P01" });
		client.runtimeGenerationError = databaseFailure;

		await expect(startSession(client)).rejects.toBe(databaseFailure);
		expect(client.calls.at(-2)).toBe("unlock");
		expect(client.calls.at(-1)).toBe("end");
	});

	it("reports a lost lock session once and remains unhealthy", async () => {
		const client = new FakeClient();
		const onFatal = vi.fn();
		const participant = await startSession(client, onFatal);
		const connectionFailure = new Error("runtime fence session lost");

		client.emit("error", connectionFailure);
		client.emit("error", new Error("duplicate socket error"));

		expect(onFatal).toHaveBeenCalledOnce();
		expect(onFatal).toHaveBeenCalledWith(connectionFailure);
		await expect(participant.assertHealthy()).rejects.toBe(connectionFailure);
		await participant.stop();
		expect(client.calls).not.toContain("unlock");
		expect(client.end).toHaveBeenCalledOnce();
	});

	it("turns a periodic liveness-query failure into a fatal callback", async () => {
		vi.useFakeTimers();
		const client = new FakeClient();
		const connectionFailure = new Error("health query timed out");
		client.query.mockImplementation(async (query: string | QueryConfig) => {
			const text = queryText(query);
			if (text.includes("select 1")) throw connectionFailure;
			if (text.includes("advisory_lock_shared")) return { rows: [{ backendPid: BACKEND_PID }] };
			if (text.includes("pg_try_advisory_lock(")) {
				return { rows: [{ acquired: true, backendPid: BACKEND_PID }] };
			}
			if (text.includes("pg_advisory_unlock(")) {
				return { rows: [{ backendPid: BACKEND_PID, released: true }] };
			}
			if (text.includes("__drizzle_migrations")) {
				return { rows: [{ backendPid: BACKEND_PID, migrationTimestamp: MIGRATION_TIMESTAMP }] };
			}
			if (text.includes("elmo_runtime_generation")) {
				return { rows: [{ backendPid: BACKEND_PID, runtimeGeneration: GENERATION }] };
			}
			return { rows: [{ backendPid: BACKEND_PID, released: true }] };
		});
		const onFatal = vi.fn();
		const participant = await startDeploymentCutoverParticipantSession({
			allowedMigrationTimestamps: [MIGRATION_TIMESTAMP],
			client,
			fenceGeneration: GENERATION,
			healthCheckIntervalMs: 10,
			onFatal,
			queryTimeoutMs: 5,
			verifyApplicationDatabaseScope: vi.fn(async () => undefined),
		});

		await vi.advanceTimersByTimeAsync(10);
		expect(onFatal).toHaveBeenCalledOnce();
		expect(onFatal).toHaveBeenCalledWith(connectionFailure);
		await participant.stop();
	});

	it("treats a changed dedicated backend as fatal before serving more work", async () => {
		const client = new FakeClient();
		const onFatal = vi.fn();
		const participant = await startSession(client, onFatal);
		client.query.mockResolvedValueOnce({ rows: [{ backendPid: "5252", healthy: 1 }] });

		await expect(participant.assertHealthy()).rejects.toThrow(/changed PostgreSQL backend sessions/);
		expect(onFatal).toHaveBeenCalledOnce();
		await participant.stop();
		expect(client.calls).not.toContain("unlock");
	});

	it("treats runtime-generation drift as fatal during periodic health", async () => {
		const client = new FakeClient();
		const onFatal = vi.fn();
		const participant = await startSession(client, onFatal);
		client.query.mockResolvedValueOnce({
			rows: [
				{
					backendPid: BACKEND_PID,
					healthy: 1,
					migrationTimestamp: MIGRATION_TIMESTAMP,
					runtimeGeneration: "pre-0020",
				},
			],
		});

		await expect(participant.assertHealthy()).rejects.toThrow(/runtime generation pre-0020.*0020/);
		expect(onFatal).toHaveBeenCalledOnce();
		await participant.stop();
		expect(client.calls).not.toContain("unlock");
	});

	it("releases the shared fence only after health checks stop and closes the session", async () => {
		const client = new FakeClient();
		const participant = await startSession(client);
		await participant.assertHealthy();
		await participant.stop();
		await participant.stop();

		expect(client.calls).toEqual([
			"connect",
			"lock",
			"identity-lock",
			"verify-application-scope",
			"identity-unlock",
			"attest",
			"attest-generation",
			"health",
			"unlock",
			"end",
		]);
		expect(client.query).toHaveBeenCalledWith(UNLOCK_QUERY, [deploymentRuntimeFenceLockId(GENERATION)]);
		expect(client.end).toHaveBeenCalledOnce();
		await expect(participant.assertHealthy()).rejects.toThrow(/not active/);
	});
});
