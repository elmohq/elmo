import type { PoolConfig } from "pg";
import { PgBoss } from "pg-boss";

let boss: PgBoss | undefined;

// A query whose socket dies without a FIN/RST never settles on its own, and it
// keeps its pool slot until it does, so enough of them wedge the whole pool.
const poolOptions: PoolConfig = {
	keepAlive: true,
	keepAliveInitialDelayMillis: 10_000,
	query_timeout: 120_000,
};

// Built on first use rather than at import so startup env validation runs first.
export function getBoss(): PgBoss {
	boss ??= new PgBoss({
		...poolOptions,
		connectionString: process.env.DATABASE_URL,
		schema: "pgboss",
		maintenanceIntervalSeconds: 30,
	});
	return boss;
}
