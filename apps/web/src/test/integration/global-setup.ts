import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const migrationsFolder = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../../packages/lib/src/db/migrations",
);

export default async function setup() {
	const url = process.env.TEST_DATABASE_URL;
	if (!url) {
		throw new Error(
			"Integration tests need TEST_DATABASE_URL: a Postgres database they may migrate and write to, e.g. postgres://postgres:postgres@localhost:5432/elmo_test",
		);
	}
	const db = drizzle(url);
	try {
		await migrate(db, { migrationsFolder });
	} finally {
		await db.$client.end();
	}
}
