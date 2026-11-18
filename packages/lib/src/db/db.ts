import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const DEFAULT_POOL_MAX = 10;

export function databasePoolMax(env: { DATABASE_POOL_MAX?: string } = process.env): number {
	const raw = env.DATABASE_POOL_MAX?.trim();
	if (!raw) return DEFAULT_POOL_MAX;
	const max = Number(raw);
	if (!Number.isInteger(max) || max < 1) {
		throw new Error(`DATABASE_POOL_MAX must be a positive whole number, got "${raw}"`);
	}
	return max;
}

export function createPool(url: string) {
	return new pg.Pool({
		connectionString: url,
		max: databasePoolMax(),
		connectionTimeoutMillis: 15_000,
		idleTimeoutMillis: 5_000,
	});
}

export function createDb(pool: pg.Pool) {
	return drizzle({ client: pool, schema });
}

/** The process's one pool: the web app's pg-boss client runs on it too, so a
 *  serverless instance holds at most DATABASE_POOL_MAX connections. */
export const pool = createPool(process.env.DATABASE_URL!);

export const db = createDb(pool);
