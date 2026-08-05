import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDirectPostgreSqlConnectionString } from "@workspace/config/database-url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { assertDatabaseConnectionIdentity } from "../src/database-connection-identity.js";
import { withDatabaseMigrationLock } from "./migration-lock.js";

const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED is required for database migration");
assertDirectPostgreSqlConnectionString(connectionString, "DATABASE_URL_UNPOOLED");
const applicationConnectionString = process.env.DATABASE_URL;
if (!applicationConnectionString)
	throw new Error("DATABASE_URL is required to verify database identity before migration");

await assertDatabaseConnectionIdentity({
	databaseUrl: applicationConnectionString,
	unpooledDatabaseUrl: connectionString,
});

const client = new Client({ connectionString, application_name: "elmo-db-migrate" });
await client.connect();
try {
	await withDatabaseMigrationLock(client, () =>
		migrate(drizzle(client), {
			migrationsFolder: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/db/migrations"),
		}),
	);
} finally {
	await client.end();
}
