// boss.ts throws at import time without DATABASE_URL, even for tests that
// never open a connection.
if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = process.env.ROLLUP_TEST_DATABASE_URL ?? "postgres://placeholder/placeholder";
}
