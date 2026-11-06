import { eq, sql } from "drizzle-orm";
import type { DbConnection } from "./db-connection";
import { type BackgroundMigration, backgroundMigrations } from "./schema";

/** The migration's row, created on first start. */
export async function beginBackgroundMigration(conn: DbConnection, name: string): Promise<BackgroundMigration> {
	await conn.insert(backgroundMigrations).values({ name }).onConflictDoNothing();
	const [row] = await conn.select().from(backgroundMigrations).where(eq(backgroundMigrations.name, name));
	return row;
}

export async function listFinishedBackgroundMigrations(conn: DbConnection): Promise<Set<string>> {
	const rows = await conn
		.select({ name: backgroundMigrations.name })
		.from(backgroundMigrations)
		.where(sql`${backgroundMigrations.finishedAt} IS NOT NULL`);
	return new Set(rows.map((row) => row.name));
}

export async function recordBackgroundProgress(
	conn: DbConnection,
	name: string,
	progress: unknown,
	rows: number,
): Promise<void> {
	await conn
		.update(backgroundMigrations)
		.set({
			progress,
			rowsDone: sql`${backgroundMigrations.rowsDone} + ${rows}`,
			lastError: null,
			updatedAt: sql`now()`,
		})
		.where(eq(backgroundMigrations.name, name));
}

export async function recordBackgroundError(conn: DbConnection, name: string, error: string): Promise<void> {
	await conn
		.update(backgroundMigrations)
		.set({ lastError: error, updatedAt: sql`now()` })
		.where(eq(backgroundMigrations.name, name));
}

export async function finishBackgroundMigration(conn: DbConnection, name: string): Promise<void> {
	await conn
		.update(backgroundMigrations)
		.set({ finishedAt: sql`now()`, updatedAt: sql`now()` })
		.where(eq(backgroundMigrations.name, name));
}
