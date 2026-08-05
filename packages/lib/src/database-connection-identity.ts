import { randomBytes } from "node:crypto";
import {
	assertDirectPostgreSqlConnectionString,
	parsePostgreSqlConnectionTarget,
} from "@workspace/config/database-url";
import { Client } from "pg";

const QUERY_TIMEOUT_MS = 5_000;

function readRow(result: unknown): Record<string, unknown> {
	if (
		typeof result !== "object" ||
		result === null ||
		!("rows" in result) ||
		!Array.isArray(result.rows) ||
		result.rows.length !== 1 ||
		typeof result.rows[0] !== "object" ||
		result.rows[0] === null
	) {
		throw new Error("PostgreSQL returned an invalid database identity challenge result");
	}
	return result.rows[0] as Record<string, unknown>;
}

export function createDatabaseIdentityLockId(): string {
	const bytes = randomBytes(8);
	bytes[0] &= 0x3f;
	return bytes.readBigUInt64BE().toString();
}

export async function assertDatabaseConnectionIdentity(input: {
	databaseUrl: string;
	unpooledDatabaseUrl: string;
	lockId?: string;
}): Promise<void> {
	parsePostgreSqlConnectionTarget(input.databaseUrl, "DATABASE_URL");
	assertDirectPostgreSqlConnectionString(input.unpooledDatabaseUrl, "DATABASE_URL_UNPOOLED");
	const lockId = input.lockId ?? createDatabaseIdentityLockId();
	if (!/^(0|[1-9][0-9]{0,18})$/u.test(lockId) || BigInt(lockId) > BigInt("4611686018427387903")) {
		throw new Error("Database identity challenge lock ID is invalid");
	}
	const direct = new Client({
		application_name: "elmo-database-identity-direct",
		connectionString: input.unpooledDatabaseUrl,
		connectionTimeoutMillis: 10_000,
		keepAlive: true,
		query_timeout: QUERY_TIMEOUT_MS,
	});
	const application = new Client({
		application_name: "elmo-database-identity-application",
		connectionString: input.databaseUrl,
		connectionTimeoutMillis: 10_000,
		query_timeout: QUERY_TIMEOUT_MS,
	});
	let directConnected = false;
	let applicationConnected = false;
	let directLockHeld = false;
	try {
		await direct.connect();
		directConnected = true;
		const acquired = readRow(
			await direct.query("select pg_backend_pid()::text as backend, pg_try_advisory_lock($1::bigint) as acquired", [
				lockId,
			]),
		);
		if (typeof acquired.backend !== "string" || acquired.acquired !== true) {
			throw new Error("DATABASE_URL_UNPOOLED could not acquire the database identity challenge lock");
		}
		directLockHeld = true;

		await application.connect();
		applicationConnected = true;
		const observed = readRow(
			await application.query("select pg_try_advisory_xact_lock($1::bigint) as acquired", [lockId]),
		);
		if (observed.acquired !== false) {
			throw new Error("DATABASE_URL and DATABASE_URL_UNPOOLED do not resolve to the same PostgreSQL lock scope");
		}

		const released = readRow(
			await direct.query("select pg_backend_pid()::text as backend, pg_advisory_unlock($1::bigint) as released", [
				lockId,
			]),
		);
		if (released.backend !== acquired.backend || released.released !== true) {
			throw new Error("DATABASE_URL_UNPOOLED did not preserve one PostgreSQL backend session");
		}
		directLockHeld = false;
	} finally {
		if (directConnected && directLockHeld) {
			await direct.query("select pg_advisory_unlock($1::bigint)", [lockId]).catch(() => undefined);
		}
		if (applicationConnected) await application.end().catch(() => undefined);
		if (directConnected) await direct.end().catch(() => undefined);
	}
}
