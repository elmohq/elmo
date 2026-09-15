// `../src/boss.ts` and `@workspace/lib/db/db` both read DATABASE_URL at import
// time (the latter only lazily connects; the former throws if it's unset), so
// any test that imports a job file needs a value present even when it never
// opens a real connection. Point it at the throwaway test database when one is
// given (ROLLUP_TEST_DATABASE_URL gates the integration suites), otherwise a
// placeholder is enough to satisfy the constructor.
if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = process.env.ROLLUP_TEST_DATABASE_URL ?? "postgres://placeholder/placeholder";
}
