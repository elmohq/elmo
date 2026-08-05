import { describe, expect, it } from "vitest";
import { assertDirectPostgreSqlConnectionString, parsePostgreSqlConnectionTarget } from "./database-url";

describe("PostgreSQL connection target parsing", () => {
	it("uses effective query overrides for routing", () => {
		expect(
			parsePostgreSqlConnectionTarget(
				"postgres://user:secret@authority:5432/app?host=effective.example&port=5444&database=other",
			),
		).toMatchObject({ host: "effective.example", port: "5444" });
	});

	it("rejects a pooler hidden in effective query parameters", () => {
		expect(() =>
			assertDirectPostgreSqlConnectionString(
				"postgres://user:secret@direct.example:5432/app?host=tenant-pooler.example&port=6543",
			),
		).toThrow(/transaction pooler/);
	});

	it("does not read container-only TLS credential paths while parsing the target", () => {
		expect(() =>
			parsePostgreSqlConnectionTarget(
				"postgres://user:secret@direct.example:5432/app?sslmode=verify-full&sslcert=/run/secrets/missing.crt&sslkey=/run/secrets/missing.key&sslrootcert=/certs/missing-ca.pem",
			),
		).not.toThrow();
	});

	it.each(["postgres:///elmo?user=elmo", "postgres://elmo@database.example/", "postgres://database.example/elmo"])(
		"rejects process-dependent direct connection target %s",
		(connectionString) => {
			expect(() => assertDirectPostgreSqlConnectionString(connectionString)).toThrow(
				/must explicitly specify PostgreSQL/,
			);
		},
	);

	it("supports explicit Unix-socket routing", () => {
		expect(
			assertDirectPostgreSqlConnectionString("postgresql:///elmo?host=%2Fvar%2Frun%2Fpostgresql&user=elmo"),
		).toMatchObject({ database: "elmo", host: "/var/run/postgresql", user: "elmo" });
	});
});
