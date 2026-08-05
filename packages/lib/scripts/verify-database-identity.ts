import { assertDatabaseConnectionIdentity } from "../src/database-connection-identity.js";

function requiredEnvironment(
	name: "DATABASE_URL" | "DATABASE_URL_UNPOOLED" | "ELMO_DATABASE_IDENTITY_LOCK_ID",
): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is required to verify database connection identity`);
	return value;
}

void assertDatabaseConnectionIdentity({
	databaseUrl: requiredEnvironment("DATABASE_URL"),
	unpooledDatabaseUrl: requiredEnvironment("DATABASE_URL_UNPOOLED"),
	lockId: requiredEnvironment("ELMO_DATABASE_IDENTITY_LOCK_ID"),
}).catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
