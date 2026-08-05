import { assertDirectPostgreSqlConnectionString } from "@workspace/config/database-url";
import { Client } from "pg";
import { transitionDatabaseRuntimeGeneration } from "./runtime-generation.js";

const generation = process.env.ELMO_RUNTIME_GENERATION_TARGET?.trim();
if (!generation || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(generation)) {
	throw new Error("ELMO_RUNTIME_GENERATION_TARGET is required and must be a valid runtime generation");
}
const expectedGeneration = process.env.ELMO_RUNTIME_GENERATION_EXPECTED?.trim();
if (!expectedGeneration || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(expectedGeneration)) {
	throw new Error("ELMO_RUNTIME_GENERATION_EXPECTED is required and must be a valid runtime generation");
}
const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED is required to set the runtime generation");
assertDirectPostgreSqlConnectionString(connectionString, "DATABASE_URL_UNPOOLED");

const client = new Client({
	application_name: "elmo-upgrade-runtime-generation",
	connectionString,
	connectionTimeoutMillis: 10_000,
	query_timeout: 5_000,
});
await client.connect();
try {
	await transitionDatabaseRuntimeGeneration(client, { expectedGeneration, generation });
} catch (error) {
	if (
		process.env.ELMO_RUNTIME_GENERATION_ALLOW_MISSING_TABLE === "1" &&
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "42P01"
	) {
		// Before migration 0020, absence of the epoch table is the pre-0020 state.
	} else {
		throw error;
	}
} finally {
	await client.end();
}
