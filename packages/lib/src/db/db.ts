import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolConfig } from "pg";
import * as schema from "./schema";

export function createDb(url: string, pool?: Omit<PoolConfig, "connectionString">) {
	return drizzle({ connection: { connectionString: url, ...pool }, schema });
}

// On Vercel, fail fast when the pooler can't hand out a connection instead of
// hanging until the function times out, and close idle clients quickly so a
// suspended instance doesn't hold them. Not applied elsewhere: the worker runs
// more concurrent jobs than the pool has clients, so a client wait can be long.
const vercelPool: Omit<PoolConfig, "connectionString"> = {
	connectionTimeoutMillis: 5_000,
	idleTimeoutMillis: 5_000,
};

export const db = createDb(process.env.DATABASE_URL!, process.env.VERCEL === "1" ? vercelPool : undefined);
