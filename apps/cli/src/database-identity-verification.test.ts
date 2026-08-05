import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
	assertSessionAffineDatabaseUrl,
	buildDatabaseIdentityVerificationOverride,
	DATABASE_IDENTITY_VERIFIER_SERVICE,
	isCliManagedLocalPostgresDatabaseUrl,
	randomizedDatabaseIdentityLockId,
} from "./database-identity-verification.js";

describe("database connection identity verification", () => {
	it("generates positive randomized advisory keys within the signed bigint range", () => {
		const first = randomizedDatabaseIdentityLockId();
		const second = randomizedDatabaseIdentityLockId();
		expect(first).not.toBe(second);
		expect(BigInt(first)).toBeGreaterThanOrEqual(0n);
		expect(BigInt(first)).toBeLessThanOrEqual(4_611_686_018_427_387_903n);
	});

	it.each([
		"postgres://user@direct.example/elmo?host=tenant-pooler.example&port=5432",
		"postgres://user@direct.example/elmo?host=direct.example&port=6543",
		"postgres://user@direct.example:5432/elmo?host=direct.example,pooler.example",
	])("rejects known pooler routing in URL authority or query overrides", (databaseUrl) => {
		expect(() => assertSessionAffineDatabaseUrl(databaseUrl)).toThrow(/transaction pooler/);
	});

	it.each([
		["postgres://user:secret@postgres:5432/elmo", true],
		["postgres://user:secret@ignored:9999/elmo?host=postgres&port=5432", true],
		["postgres://user:secret@postgres:5432/elmo?host=external-pooler.example&port=6543", false],
		["postgres://user:secret@postgres:5432/elmo?port=6543", false],
	] as const)("classifies the effective managed-local database target in %s", (databaseUrl, expected) => {
		expect(isCliManagedLocalPostgresDatabaseUrl(databaseUrl)).toBe(expected);
	});

	it("checks lock visibility and backend continuity without embedding either URL", () => {
		const override = buildDatabaseIdentityVerificationOverride({
			lockId: "123456789",
			migrationImageId: `sha256:${"a".repeat(64)}`,
			composeContents: `
services:
  db-migrate:
    image: operator/migrate
    networks: [private-db]
    volumes:
      - ./certs:/certs/elmo:ro
networks:
  private-db: {}
`,
		});
		const document = parse(override) as { services: Record<string, Record<string, unknown>> };
		const service = document.services[DATABASE_IDENTITY_VERIFIER_SERVICE];

		expect(service).toMatchObject({
			image: `sha256:${"a".repeat(64)}`,
			pull_policy: "never",
			command: ["./node_modules/.bin/tsx", "scripts/verify-database-identity.ts"],
			networks: ["private-db"],
			volumes: ["./certs:/certs/elmo:ro"],
			environment: {
				DATABASE_URL: `\${DATABASE_URL:?DATABASE_URL is required}`,
				DATABASE_URL_UNPOOLED: `\${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}`,
				ELMO_DATABASE_IDENTITY_LOCK_ID: "123456789",
			},
		});
		expect(override).not.toContain("postgres://");
	});

	it("uses a transaction-scoped challenge on the possibly pooled application connection", async () => {
		const script = await readFile(
			new URL("../../../packages/lib/src/database-connection-identity.ts", import.meta.url),
			"utf8",
		);
		expect(script).toContain("pg_try_advisory_xact_lock");
		expect(script).not.toMatch(/application\.query\([^)]*pg_try_advisory_lock/u);
		expect(script).toContain("pg_backend_pid()");
	});
});
