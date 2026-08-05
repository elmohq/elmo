import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertDirectPostgreSqlConnectionString } from "@workspace/config/database-url";
import { Client, type ClientConfig, type QueryConfig } from "pg";

/** Serializes deployment upgrade controllers for one PostgreSQL database. */
export const ELMO_UPGRADE_CUTOVER_LOCK_ID = "7275516647631226992";

/** Runtime/database profile compiled into the current release images. */
export const ELMO_RUNTIME_FENCE_GENERATION = "0020";
export const ELMO_RUNTIME_ALLOWED_MIGRATION_TIMESTAMPS = ["1785915298354"] as const;
export const ELMO_RUNTIME_FENCE_MARKER_PATH = "/app/.elmo-runtime-fence-generation";
export const ELMO_RUNTIME_FENCE_HEALTH_CHECK_INTERVAL_MS = 5_000;
export const ELMO_RUNTIME_FENCE_QUERY_TIMEOUT_MS = 5_000;
export const ELMO_SOURCE_FENCE_QUIESCENCE_MS = 15_000;

const RUNTIME_FENCE_LOCK_DOMAIN = "com.elmohq.elmo/deployment-runtime-fence/v1/";

export interface DeploymentCutoverParticipantClient {
	connect(): Promise<unknown>;
	end(): Promise<void>;
	on(event: "error", listener: (error: Error) => void): unknown;
	removeListener(event: "error", listener: (error: Error) => void): unknown;
	query(query: string | QueryConfig, values?: unknown[]): Promise<unknown>;
}

export interface DeploymentCutoverParticipant {
	/** Runs an immediate liveness query on the dedicated lock session. */
	assertHealthy(): Promise<void>;
	/** Releases the shared fence and closes its dedicated PostgreSQL session. */
	stop(): Promise<void>;
}

export interface DeploymentCutoverParticipantOptions {
	/** Must address PostgreSQL directly; transaction-pooled URLs cannot hold session locks safely. */
	connectionString: string;
	/** The application's normal database URL, used to prove both URLs address one advisory-lock scope. */
	applicationConnectionString: string;
	applicationName: string;
	fenceGeneration: string;
	allowedMigrationTimestamps: readonly string[];
	onFatal(error: Error): void | Promise<void>;
	healthCheckIntervalMs?: number;
	queryTimeoutMs?: number;
	startupSignal?: AbortSignal;
}

export interface DeploymentRuntimeFenceConfig {
	connectionString: string;
	applicationConnectionString: string;
	fenceGeneration: string;
	allowedMigrationTimestamps: readonly string[];
}

export interface DeploymentRuntimeFenceEnvironment {
	DATABASE_URL?: string;
	DATABASE_URL_UNPOOLED?: string;
	DEPLOYMENT_MODE?: string;
	ELMO_RUNTIME_FENCE_GENERATION?: string;
}

export interface DeploymentCutoverParticipantSessionOptions
	extends Omit<
		DeploymentCutoverParticipantOptions,
		"applicationConnectionString" | "applicationName" | "connectionString" | "startupSignal"
	> {
	client: DeploymentCutoverParticipantClient;
	verifyApplicationDatabaseScope(lockId: string): Promise<void>;
}

type ParticipantState = "starting" | "active" | "failed" | "stopping" | "stopped";

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function isMissingFileError(error: unknown): boolean {
	return isRecord(error) && error.code === "ENOENT";
}

function assertPositiveDuration(name: string, duration: number): void {
	if (!Number.isSafeInteger(duration) || duration <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
}

function assertFenceGeneration(generation: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(generation)) {
		throw new Error(
			"The deployment runtime fence generation must be 1-64 letters, numbers, dots, underscores, or hyphens",
		);
	}
}

function normalizeMigrationTimestamps(timestamps: readonly string[]): Set<string> {
	if (timestamps.length === 0) {
		throw new Error("At least one allowed deployment migration timestamp is required");
	}

	const normalized = new Set<string>();
	for (const timestamp of timestamps) {
		if (!/^(0|[1-9][0-9]*)$/.test(timestamp)) {
			throw new Error(`Invalid deployment migration timestamp: ${timestamp}`);
		}
		normalized.add(timestamp);
	}
	return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSingleRow(result: unknown, operation: string): Record<string, unknown> {
	if (!isRecord(result) || !Array.isArray(result.rows) || result.rows.length !== 1 || !isRecord(result.rows[0])) {
		throw new Error(`PostgreSQL did not return one row while ${operation}`);
	}
	return result.rows[0];
}

function readSingleBoolean(result: unknown, column: string): boolean {
	const row = readSingleRow(result, `reading ${column}`);
	if (typeof row[column] !== "boolean") {
		throw new Error(`PostgreSQL did not return a boolean ${column} value`);
	}
	return row[column];
}

function readBackendPid(result: unknown, operation: string): string {
	const backendPid = readSingleRow(result, operation).backendPid;
	if (typeof backendPid !== "string" || !/^[1-9][0-9]*$/.test(backendPid)) {
		throw new Error(`PostgreSQL did not return its backend PID while ${operation}`);
	}
	return backendPid;
}

function assertBackendPid(result: unknown, expectedBackendPid: string, operation: string): void {
	if (readBackendPid(result, operation) !== expectedBackendPid) {
		throw new Error(`DATABASE_URL_UNPOOLED changed PostgreSQL backend sessions while ${operation}`);
	}
}

function readMigrationTimestamp(result: unknown): string {
	const row = readSingleRow(result, "reading the current Drizzle migration");
	if (typeof row.migrationTimestamp !== "string") {
		throw new Error("PostgreSQL did not return the current Drizzle migration timestamp");
	}
	return row.migrationTimestamp;
}

function readRuntimeGeneration(result: unknown): string {
	const row = readSingleRow(result, "reading the database runtime generation");
	if (typeof row.runtimeGeneration !== "string" || !row.runtimeGeneration) {
		throw new Error("PostgreSQL did not return the database runtime generation");
	}
	return row.runtimeGeneration;
}

/**
 * Derives the database-global advisory-lock key for one runtime generation.
 * The domain prefix keeps these keys separate from other Elmo advisory locks.
 */
export function deploymentRuntimeFenceLockId(generation: string): string {
	assertFenceGeneration(generation);
	const digest = createHash("sha256").update(`${RUNTIME_FENCE_LOCK_DOMAIN}${generation}`, "utf8").digest();
	digest[0] &= 0x7f;
	return digest.readBigUInt64BE(0).toString();
}

function runtimeDatabaseIdentityChallengeLockId(generationLockId: string): string {
	let lockId: string;
	do {
		const bytes = randomBytes(8);
		bytes[0] &= 0x3f;
		lockId = bytes.readBigUInt64BE(0).toString();
	} while (lockId === generationLockId);
	return lockId;
}

/**
 * Resolves the image-attested runtime profile. A source checkout opts in by
 * setting the generation; published images additionally carry a marker file,
 * so clearing an environment variable cannot silently bypass the fence.
 */
export function resolveDeploymentRuntimeFenceConfig(input: {
	environment: DeploymentRuntimeFenceEnvironment;
	markerGeneration?: string;
}): DeploymentRuntimeFenceConfig | undefined {
	const markerGeneration = input.markerGeneration?.trim();
	const configuredGeneration = input.environment.ELMO_RUNTIME_FENCE_GENERATION;
	const fenceRequired =
		input.markerGeneration !== undefined ||
		configuredGeneration !== undefined ||
		input.environment.DEPLOYMENT_MODE === "cloud";
	if (!fenceRequired) return undefined;

	if (input.markerGeneration !== undefined && markerGeneration !== ELMO_RUNTIME_FENCE_GENERATION) {
		throw new Error(
			`Published runtime fence marker must be ${ELMO_RUNTIME_FENCE_GENERATION}; received ${markerGeneration || "empty content"}`,
		);
	}
	if (configuredGeneration !== ELMO_RUNTIME_FENCE_GENERATION) {
		throw new Error(`ELMO_RUNTIME_FENCE_GENERATION must be ${ELMO_RUNTIME_FENCE_GENERATION} for this runtime image`);
	}

	const applicationConnectionString = input.environment.DATABASE_URL;
	if (!applicationConnectionString?.trim()) {
		throw new Error("DATABASE_URL is required for the deployment runtime fence");
	}
	const connectionString = input.environment.DATABASE_URL_UNPOOLED;
	if (!connectionString?.trim()) {
		throw new Error("DATABASE_URL_UNPOOLED is required for the deployment runtime fence");
	}
	assertDirectPostgreSqlConnectionString(connectionString, "DATABASE_URL_UNPOOLED");

	return {
		allowedMigrationTimestamps: ELMO_RUNTIME_ALLOWED_MIGRATION_TIMESTAMPS,
		applicationConnectionString,
		connectionString,
		fenceGeneration: ELMO_RUNTIME_FENCE_GENERATION,
	};
}

export async function loadDeploymentRuntimeFenceConfig(
	environment: DeploymentRuntimeFenceEnvironment = process.env,
): Promise<DeploymentRuntimeFenceConfig | undefined> {
	let markerGeneration: string | undefined;
	try {
		markerGeneration = await readFile(ELMO_RUNTIME_FENCE_MARKER_PATH, "utf8");
	} catch (error) {
		if (!isMissingFileError(error)) throw error;
	}
	return resolveDeploymentRuntimeFenceConfig({ environment, markerGeneration });
}

function reportFatal(callback: (error: Error) => void | Promise<void>, error: Error): void {
	try {
		void Promise.resolve(callback(error)).catch((callbackError: unknown) => {
			setImmediate(() => {
				throw callbackError;
			});
		});
	} catch (callbackError) {
		setImmediate(() => {
			throw callbackError;
		});
	}
}

/**
 * Starts a participant around an already-dedicated PostgreSQL session. The
 * returned promise is the readiness boundary: it resolves only after the
 * generation fence is held and the database migration journal is attested.
 */
export async function startDeploymentCutoverParticipantSession(
	input: DeploymentCutoverParticipantSessionOptions,
): Promise<DeploymentCutoverParticipant> {
	assertFenceGeneration(input.fenceGeneration);
	const allowedMigrationTimestamps = normalizeMigrationTimestamps(input.allowedMigrationTimestamps);
	const healthCheckIntervalMs = input.healthCheckIntervalMs ?? ELMO_RUNTIME_FENCE_HEALTH_CHECK_INTERVAL_MS;
	const queryTimeoutMs = input.queryTimeoutMs ?? ELMO_RUNTIME_FENCE_QUERY_TIMEOUT_MS;
	assertPositiveDuration("healthCheckIntervalMs", healthCheckIntervalMs);
	assertPositiveDuration("queryTimeoutMs", queryTimeoutMs);

	const lockId = deploymentRuntimeFenceLockId(input.fenceGeneration);
	let state: ParticipantState = "starting";
	let startupConnectionFailure: Error | undefined;
	let fatalFailure: Error | undefined;
	let healthTimer: NodeJS.Timeout | undefined;
	let healthQuery: Promise<void> | undefined;
	let stopPromise: Promise<void> | undefined;
	let lockAcquired = false;
	let backendPid: string | undefined;

	const handleConnectionError = (error: Error) => {
		if (state === "starting") {
			startupConnectionFailure ??= error;
			return;
		}
		if (state !== "active") return;

		state = "failed";
		fatalFailure = error;
		if (healthTimer) clearTimeout(healthTimer);
		reportFatal(input.onFatal, error);
	};

	input.client.on("error", handleConnectionError);

	const healthQueryConfig: QueryConfig & { query_timeout: number } = {
		text: 'select 1 as healthy, pg_backend_pid()::text as "backendPid", (select generation from elmo_runtime_generation where singleton = true) as "runtimeGeneration", (select created_at::text from drizzle.__drizzle_migrations order by created_at desc limit 1) as "migrationTimestamp"',
		query_timeout: queryTimeoutMs,
	};

	const runHealthQuery = async (): Promise<void> => {
		if (state === "failed") throw fatalFailure;
		if (state !== "active") throw new Error("The deployment cutover participant is not active");

		try {
			const result = await input.client.query(healthQueryConfig);
			if (!backendPid) throw new Error("The deployment cutover participant has no recorded PostgreSQL backend");
			assertBackendPid(result, backendPid, "checking the deployment runtime fence");
			const runtimeGeneration = readRuntimeGeneration(result);
			if (runtimeGeneration !== input.fenceGeneration) {
				throw new Error(
					`Database runtime generation ${runtimeGeneration} is not compatible with runtime fence generation ${input.fenceGeneration}`,
				);
			}
			const migrationTimestamp = readMigrationTimestamp(result);
			if (!allowedMigrationTimestamps.has(migrationTimestamp)) {
				throw new Error(
					`Database migration ${migrationTimestamp} is not compatible with runtime fence generation ${input.fenceGeneration}`,
				);
			}
		} catch (error) {
			const failure = asError(error);
			handleConnectionError(failure);
			throw failure;
		}
	};

	const scheduleHealthCheck = (): void => {
		if (state !== "active") return;
		healthTimer = setTimeout(() => {
			healthQuery = runHealthQuery();
			void healthQuery
				.catch(() => undefined)
				.finally(() => {
					healthQuery = undefined;
					scheduleHealthCheck();
				});
		}, healthCheckIntervalMs);
		healthTimer.unref();
	};

	try {
		await input.client.connect();
		if (startupConnectionFailure) throw startupConnectionFailure;

		const lockResult = await input.client.query(
			'select pg_advisory_lock_shared($1::bigint), pg_backend_pid()::text as "backendPid"',
			[lockId],
		);
		lockAcquired = true;
		backendPid = readBackendPid(lockResult, "acquiring the deployment runtime fence");
		if (startupConnectionFailure) throw startupConnectionFailure;

		const identityLockId = runtimeDatabaseIdentityChallengeLockId(lockId);
		const identityLockResult = await input.client.query(
			'select pg_backend_pid()::text as "backendPid", pg_try_advisory_lock($1::bigint) as acquired',
			[identityLockId],
		);
		assertBackendPid(identityLockResult, backendPid, "starting the database identity challenge");
		if (!readSingleBoolean(identityLockResult, "acquired")) {
			throw new Error("DATABASE_URL_UNPOOLED could not acquire the database identity challenge lock");
		}
		let identityProofFailure: unknown;
		try {
			await input.verifyApplicationDatabaseScope(identityLockId);
		} catch (error) {
			identityProofFailure = error;
		}
		let identityUnlockFailure: unknown;
		try {
			const identityUnlockResult = await input.client.query(
				'select pg_backend_pid()::text as "backendPid", pg_advisory_unlock($1::bigint) as released',
				[identityLockId],
			);
			assertBackendPid(identityUnlockResult, backendPid, "finishing the database identity challenge");
			if (!readSingleBoolean(identityUnlockResult, "released")) {
				throw new Error("DATABASE_URL_UNPOOLED lost the database identity challenge lock");
			}
		} catch (error) {
			identityUnlockFailure = error;
		}
		if (identityProofFailure && identityUnlockFailure) {
			throw new AggregateError(
				[identityProofFailure, identityUnlockFailure],
				"Database identity proof and challenge cleanup both failed",
			);
		}
		if (identityProofFailure) throw identityProofFailure;
		if (identityUnlockFailure) throw identityUnlockFailure;
		if (startupConnectionFailure) throw startupConnectionFailure;

		const migrationResult = await input.client.query(
			'select created_at::text as "migrationTimestamp", pg_backend_pid()::text as "backendPid" from drizzle.__drizzle_migrations order by created_at desc limit 1',
		);
		assertBackendPid(migrationResult, backendPid, "attesting the deployment migration");
		const migrationTimestamp = readMigrationTimestamp(migrationResult);
		if (!allowedMigrationTimestamps.has(migrationTimestamp)) {
			throw new Error(
				`Database migration ${migrationTimestamp} is not compatible with runtime fence generation ${input.fenceGeneration}`,
			);
		}

		const runtimeGenerationResult = await input.client.query(
			'select generation as "runtimeGeneration", pg_backend_pid()::text as "backendPid" from elmo_runtime_generation where singleton = true',
		);
		assertBackendPid(runtimeGenerationResult, backendPid, "attesting the database runtime generation");
		const runtimeGeneration = readRuntimeGeneration(runtimeGenerationResult);
		if (runtimeGeneration !== input.fenceGeneration) {
			throw new Error(
				`Database runtime generation ${runtimeGeneration} is not compatible with runtime fence generation ${input.fenceGeneration}`,
			);
		}
		if (startupConnectionFailure) throw startupConnectionFailure;

		state = "active";
		scheduleHealthCheck();
	} catch (error) {
		state = "stopping";
		const startupFailure = asError(error);
		if (lockAcquired) {
			await input.client
				.query('select pg_advisory_unlock_shared($1::bigint) as released, pg_backend_pid()::text as "backendPid"', [
					lockId,
				])
				.then((result) => {
					if (backendPid) assertBackendPid(result, backendPid, "releasing a failed deployment runtime fence");
				})
				.catch(() => undefined);
		}
		await input.client.end().catch(() => undefined);
		input.client.removeListener("error", handleConnectionError);
		state = "stopped";
		throw startupFailure;
	}

	return {
		async assertHealthy() {
			await runHealthQuery();
		},
		stop() {
			stopPromise ??= (async () => {
				if (state === "stopped") return;
				const wasFailed = state === "failed";
				state = "stopping";
				if (healthTimer) clearTimeout(healthTimer);
				await healthQuery?.catch(() => undefined);

				const cleanupErrors: unknown[] = [];
				if (!wasFailed && lockAcquired) {
					try {
						const result = await input.client.query(
							'select pg_advisory_unlock_shared($1::bigint) as released, pg_backend_pid()::text as "backendPid"',
							[lockId],
						);
						if (!backendPid) throw new Error("The deployment cutover participant has no recorded PostgreSQL backend");
						assertBackendPid(result, backendPid, "releasing the deployment runtime fence");
						if (!readSingleBoolean(result, "released")) {
							throw new Error("The PostgreSQL session no longer owns its deployment runtime fence");
						}
					} catch (error) {
						cleanupErrors.push(error);
					}
				}
				try {
					await input.client.end();
				} catch (error) {
					cleanupErrors.push(error);
				}
				input.client.removeListener("error", handleConnectionError);
				state = "stopped";

				if (cleanupErrors.length === 1) throw cleanupErrors[0];
				if (cleanupErrors.length > 1) {
					throw new AggregateError(cleanupErrors, "Failed to stop the deployment cutover participant");
				}
			})();
			return stopPromise;
		},
	};
}

/** Starts a deployment runtime fence on a new, dedicated pg Client session. */
export async function startDeploymentCutoverParticipant(
	input: DeploymentCutoverParticipantOptions,
): Promise<DeploymentCutoverParticipant> {
	const { applicationConnectionString, applicationName, connectionString, startupSignal, ...sessionOptions } = input;
	if (startupSignal?.aborted) throw new Error("Deployment runtime fence startup was cancelled");
	assertDirectPostgreSqlConnectionString(connectionString, "DATABASE_URL_UNPOOLED");
	if (!applicationConnectionString.trim()) throw new Error("DATABASE_URL is required for the deployment runtime fence");
	const clientConfig: ClientConfig = {
		application_name: applicationName,
		connectionString,
		connectionTimeoutMillis: 10_000,
		keepAlive: true,
		keepAliveInitialDelayMillis: input.healthCheckIntervalMs ?? ELMO_RUNTIME_FENCE_HEALTH_CHECK_INTERVAL_MS,
	};
	const client = new Client(clientConfig);
	const cancelStartup = () => {
		void client.end();
	};
	startupSignal?.addEventListener("abort", cancelStartup, { once: true });
	try {
		return await startDeploymentCutoverParticipantSession({
			...sessionOptions,
			client,
			verifyApplicationDatabaseScope: async (lockId) => {
				const applicationClient = new Client({
					application_name: `${applicationName}-application-proof`.slice(0, 63),
					connectionString: applicationConnectionString,
					connectionTimeoutMillis: 10_000,
					query_timeout: input.queryTimeoutMs ?? ELMO_RUNTIME_FENCE_QUERY_TIMEOUT_MS,
				});
				const cancelApplicationProof = () => {
					void applicationClient.end();
				};
				startupSignal?.addEventListener("abort", cancelApplicationProof, { once: true });
				try {
					await applicationClient.connect();
					if (startupSignal?.aborted) throw new Error("Deployment runtime fence startup was cancelled");
					const result = await applicationClient.query("select pg_try_advisory_xact_lock($1::bigint) as acquired", [
						lockId,
					]);
					if (readSingleBoolean(result, "acquired")) {
						throw new Error(
							"DATABASE_URL and DATABASE_URL_UNPOOLED do not resolve to the same PostgreSQL advisory-lock scope",
						);
					}
				} finally {
					startupSignal?.removeEventListener("abort", cancelApplicationProof);
					await applicationClient.end().catch(() => undefined);
				}
			},
		});
	} finally {
		startupSignal?.removeEventListener("abort", cancelStartup);
	}
}
