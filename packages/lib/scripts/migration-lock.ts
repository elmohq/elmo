export const ELMO_MIGRATION_LOCK_ID = "7275516647631226991";

export interface MigrationLockClient {
	query(query: string, values?: unknown[]): Promise<unknown>;
}

function readLockState(result: unknown): { backend: string; released?: boolean } {
	if (
		typeof result !== "object" ||
		result === null ||
		!("rows" in result) ||
		!Array.isArray(result.rows) ||
		result.rows.length !== 1 ||
		typeof result.rows[0] !== "object" ||
		result.rows[0] === null ||
		!("backend" in result.rows[0]) ||
		typeof result.rows[0].backend !== "string"
	) {
		throw new Error("PostgreSQL did not return the migration lock backend PID");
	}
	return result.rows[0] as { backend: string; released?: boolean };
}

export async function withDatabaseMigrationLock<T>(client: MigrationLockClient, migrate: () => Promise<T>): Promise<T> {
	const acquisition = readLockState(
		await client.query("select pg_backend_pid()::text as backend, pg_advisory_lock($1::bigint)", [
			ELMO_MIGRATION_LOCK_ID,
		]),
	);
	try {
		const result = await migrate();
		const release = readLockState(
			await client.query("select pg_backend_pid()::text as backend, pg_advisory_unlock($1::bigint) as released", [
				ELMO_MIGRATION_LOCK_ID,
			]),
		);
		if (release.backend !== acquisition.backend || release.released !== true) {
			throw new Error("The database migration lock session changed PostgreSQL backends");
		}
		return result;
	} catch (error) {
		await client
			.query("select pg_backend_pid()::text as backend, pg_advisory_unlock($1::bigint) as released", [
				ELMO_MIGRATION_LOCK_ID,
			])
			.catch(() => undefined);
		throw error;
	}
}
