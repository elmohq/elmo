import type { DbConnection } from "../db/db-connection";

/**
 * Runs `fn` in a transaction. Passing the db handle opens one; passing an open
 * transaction opens a savepoint inside it, so a step joins its caller's
 * transaction and a failure rolls back only that step.
 */
export function inTransaction<T>(conn: DbConnection, fn: (tx: DbConnection) => Promise<T>): Promise<T> {
	return conn.transaction((tx) => fn(tx));
}
