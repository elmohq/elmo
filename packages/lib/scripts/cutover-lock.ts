import { ELMO_UPGRADE_CUTOVER_LOCK_ID } from "../src/deployment-cutover.js";

export { ELMO_UPGRADE_CUTOVER_LOCK_ID };
export const CUTOVER_LOCK_CONTENTION_EXIT_CODE = 75;

export interface CutoverLockClient {
	query(query: string, values?: unknown[]): Promise<unknown>;
}

export interface CutoverLockReadyMarker {
	remove(): Promise<void>;
	refresh(): Promise<void>;
}

export type CutoverLockStatus = "running" | "stopping";
export type CutoverLockWaitResult = "health-check" | "stop";

export interface CutoverLockLifetime {
	status(): CutoverLockStatus;
	waitForNextHealthCheck(): Promise<CutoverLockWaitResult>;
}

export class DatabaseUpgradeCutoverLockUnavailableError extends Error {
	readonly exitCode = CUTOVER_LOCK_CONTENTION_EXIT_CODE;

	constructor() {
		super("Another Elmo deployment upgrade already holds the database cutover lock");
		this.name = "DatabaseUpgradeCutoverLockUnavailableError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBooleanResult(result: unknown, column: string): boolean {
	if (!isRecord(result) || !Array.isArray(result.rows) || result.rows.length !== 1) {
		throw new Error(`PostgreSQL did not return one row for ${column}`);
	}
	const row = result.rows[0];
	if (!isRecord(row) || typeof row[column] !== "boolean") {
		throw new Error(`PostgreSQL did not return a boolean ${column} value`);
	}
	return row[column];
}

function readBackendResult(result: unknown): string {
	if (!isRecord(result) || !Array.isArray(result.rows) || result.rows.length !== 1) {
		throw new Error("PostgreSQL did not return one row for the cutover lock backend");
	}
	const row = result.rows[0];
	if (!isRecord(row) || typeof row.backend !== "string") {
		throw new Error("PostgreSQL did not return the cutover lock backend PID");
	}
	return row.backend;
}

export async function tryAcquireDatabaseUpgradeCutoverLock(
	client: CutoverLockClient,
	lockId = ELMO_UPGRADE_CUTOVER_LOCK_ID,
): Promise<{ acquired: boolean; backend: string }> {
	const result = await client.query(
		"select pg_backend_pid()::text as backend, pg_try_advisory_lock($1::bigint) as acquired",
		[lockId],
	);
	return { acquired: readBooleanResult(result, "acquired"), backend: readBackendResult(result) };
}

export async function releaseDatabaseUpgradeCutoverLock(
	client: CutoverLockClient,
	lockId = ELMO_UPGRADE_CUTOVER_LOCK_ID,
	expectedBackend?: string,
): Promise<void> {
	const result = await client.query(
		"select pg_backend_pid()::text as backend, pg_advisory_unlock($1::bigint) as released",
		[lockId],
	);
	if (expectedBackend && readBackendResult(result) !== expectedBackend) {
		throw new Error("The database cutover lock session changed PostgreSQL backends");
	}
	if (!readBooleanResult(result, "released")) {
		throw new Error("The current PostgreSQL session no longer owns the Elmo database cutover lock");
	}
}

export async function assertCutoverLockConnectionHealthy(
	client: CutoverLockClient,
	expectedBackend: string,
): Promise<void> {
	const result = await client.query("select pg_backend_pid()::text as backend");
	if (readBackendResult(result) !== expectedBackend) {
		throw new Error("The database cutover lock session changed PostgreSQL backends");
	}
}

/**
 * Holds the database-global upgrade fence on one PostgreSQL session. Readiness
 * is published only after a successful query and refreshed only after later
 * health queries on that same session.
 */
export async function holdDatabaseUpgradeCutoverLock(input: {
	client: CutoverLockClient;
	lockId?: string;
	lifetime: CutoverLockLifetime;
	marker: CutoverLockReadyMarker;
	readinessHealthChecks?: number;
}): Promise<void> {
	await input.marker.remove();
	const lockId = input.lockId ?? ELMO_UPGRADE_CUTOVER_LOCK_ID;

	const acquisition = await tryAcquireDatabaseUpgradeCutoverLock(input.client, lockId);
	if (!acquisition.acquired) {
		throw new DatabaseUpgradeCutoverLockUnavailableError();
	}

	let failed = false;
	let failure: unknown;
	try {
		if (input.lifetime.status() === "running") {
			await assertCutoverLockConnectionHealthy(input.client, acquisition.backend);
			for (let check = 0; check < (input.readinessHealthChecks ?? 0); check += 1) {
				if ((await input.lifetime.waitForNextHealthCheck()) === "stop") break;
				await assertCutoverLockConnectionHealthy(input.client, acquisition.backend);
			}
			if (input.lifetime.status() === "running") await input.marker.refresh();
		}

		while (input.lifetime.status() === "running") {
			const action = await input.lifetime.waitForNextHealthCheck();
			if (action === "stop") break;

			await assertCutoverLockConnectionHealthy(input.client, acquisition.backend);
			if (input.lifetime.status() === "running") {
				await input.marker.refresh();
			}
		}
	} catch (error) {
		failed = true;
		failure = error;
	}

	const cleanupErrors: unknown[] = [];
	try {
		await input.marker.remove();
	} catch (error) {
		cleanupErrors.push(error);
	}
	try {
		await releaseDatabaseUpgradeCutoverLock(input.client, lockId, acquisition.backend);
	} catch (error) {
		cleanupErrors.push(error);
	}

	if (failed) throw failure;
	if (cleanupErrors.length === 1) throw cleanupErrors[0];
	if (cleanupErrors.length > 1) {
		throw new AggregateError(cleanupErrors, "Failed to clean up the Elmo database cutover lock");
	}
}
