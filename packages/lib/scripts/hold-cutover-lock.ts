import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { assertDirectPostgreSqlConnectionString } from "@workspace/config/database-url";
import { Client } from "pg";
import {
	deploymentRuntimeFenceLockId,
	ELMO_RUNTIME_FENCE_HEALTH_CHECK_INTERVAL_MS,
	ELMO_RUNTIME_FENCE_QUERY_TIMEOUT_MS,
	ELMO_SOURCE_FENCE_QUIESCENCE_MS,
	ELMO_UPGRADE_CUTOVER_LOCK_ID,
} from "../src/deployment-cutover.js";
import {
	CUTOVER_LOCK_CONTENTION_EXIT_CODE,
	type CutoverLockLifetime,
	type CutoverLockReadyMarker,
	type CutoverLockWaitResult,
	DatabaseUpgradeCutoverLockUnavailableError,
	holdDatabaseUpgradeCutoverLock,
} from "./cutover-lock.js";

const HEALTH_CHECK_INTERVAL_MS = ELMO_RUNTIME_FENCE_HEALTH_CHECK_INTERVAL_MS;
const DATABASE_QUERY_TIMEOUT_MS = ELMO_RUNTIME_FENCE_QUERY_TIMEOUT_MS;

function createReadyMarker(markerPath: string): CutoverLockReadyMarker {
	return {
		async remove() {
			await fs.rm(markerPath, { force: true });
		},
		async refresh() {
			const temporaryPath = `${markerPath}.${process.pid}.${randomUUID()}.tmp`;
			try {
				await fs.writeFile(
					temporaryPath,
					`${JSON.stringify({ pid: process.pid, refreshedAt: new Date().toISOString() })}\n`,
					{ encoding: "utf8", flag: "wx", mode: 0o600 },
				);
				await fs.rename(temporaryPath, markerPath);
			} finally {
				await fs.rm(temporaryPath, { force: true });
			}
		},
	};
}

function createProcessLifetime(
	client: Client,
	marker: CutoverLockReadyMarker,
): CutoverLockLifetime & {
	dispose(): void;
} {
	let state: "running" | "stopping" | "failed" = "running";
	let connectionFailure: unknown;
	let settleStop!: (result: CutoverLockWaitResult) => void;
	let failStop!: (error: unknown) => void;
	const stop = new Promise<CutoverLockWaitResult>((resolve, reject) => {
		settleStop = resolve;
		failStop = reject;
	});
	void stop.catch(() => undefined);

	const requestStop = () => {
		if (state !== "running") return;
		state = "stopping";
		settleStop("stop");
	};
	const handleConnectionError = (error: Error) => {
		if (state !== "running") return;
		state = "failed";
		connectionFailure = error;
		void marker.remove().catch(() => undefined);
		failStop(error);
	};

	process.once("SIGTERM", requestStop);
	process.once("SIGINT", requestStop);
	client.on("error", handleConnectionError);

	return {
		status() {
			if (state === "failed") throw connectionFailure;
			return state;
		},
		async waitForNextHealthCheck() {
			if (state === "failed") throw connectionFailure;
			if (state === "stopping") return "stop";

			let timer: NodeJS.Timeout | undefined;
			try {
				return await Promise.race([
					new Promise<CutoverLockWaitResult>((resolve) => {
						timer = setTimeout(() => resolve("health-check"), HEALTH_CHECK_INTERVAL_MS);
					}),
					stop,
				]);
			} finally {
				if (timer) clearTimeout(timer);
			}
		},
		dispose() {
			process.removeListener("SIGTERM", requestStop);
			process.removeListener("SIGINT", requestStop);
			client.removeListener("error", handleConnectionError);
		},
	};
}

async function run(): Promise<void> {
	const connectionString = process.env.DATABASE_URL_UNPOOLED;
	if (!connectionString) {
		throw new Error("DATABASE_URL_UNPOOLED is required to hold the database cutover lock");
	}
	assertDirectPostgreSqlConnectionString(connectionString, "DATABASE_URL_UNPOOLED");
	const runtimeFenceGeneration = process.env.ELMO_CUTOVER_RUNTIME_FENCE_GENERATION?.trim();
	const lockId = runtimeFenceGeneration
		? deploymentRuntimeFenceLockId(runtimeFenceGeneration)
		: ELMO_UPGRADE_CUTOVER_LOCK_ID;

	const markerPath = process.env.ELMO_CUTOVER_LOCK_READY_FILE;
	if (!markerPath) throw new Error("ELMO_CUTOVER_LOCK_READY_FILE is required to hold the database cutover lock");
	if (!path.isAbsolute(markerPath)) throw new Error("ELMO_CUTOVER_LOCK_READY_FILE must be an absolute path");

	const marker = createReadyMarker(markerPath);
	await marker.remove();

	const client = new Client({
		application_name: "elmo-upgrade-cutover-lock",
		connectionString,
		connectionTimeoutMillis: 10_000,
		keepAlive: true,
		keepAliveInitialDelayMillis: HEALTH_CHECK_INTERVAL_MS,
		query_timeout: DATABASE_QUERY_TIMEOUT_MS,
	});
	const lifetime = createProcessLifetime(client, marker);
	let connected = false;
	let failed = false;
	let failure: unknown;
	try {
		await client.connect();
		connected = true;
		await holdDatabaseUpgradeCutoverLock({
			client,
			lifetime,
			lockId,
			marker,
			readinessHealthChecks: runtimeFenceGeneration
				? Math.ceil(ELMO_SOURCE_FENCE_QUIESCENCE_MS / HEALTH_CHECK_INTERVAL_MS)
				: 0,
		});
	} catch (error) {
		failed = true;
		failure = error;
	}

	const cleanupErrors: unknown[] = [];
	try {
		await marker.remove();
	} catch (error) {
		cleanupErrors.push(error);
	}
	if (connected) {
		try {
			await client.end();
		} catch (error) {
			cleanupErrors.push(error);
		}
	}
	lifetime.dispose();

	if (failed) throw failure;
	if (cleanupErrors.length === 1) throw cleanupErrors[0];
	if (cleanupErrors.length > 1) {
		throw new AggregateError(cleanupErrors, "Failed to clean up the Elmo database cutover lock holder");
	}
}

void run().catch((error: unknown) => {
	process.exitCode =
		error instanceof DatabaseUpgradeCutoverLockUnavailableError ? CUTOVER_LOCK_CONTENTION_EXIT_CODE : 1;
	console.error(error instanceof Error ? error.message : error);
});
