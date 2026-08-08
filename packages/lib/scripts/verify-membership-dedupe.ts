/**
 * Focused rehearsal of migration 0014's destructive step against a REAL
 * Postgres: given duplicate `member` rows (which older whitelabel/local installs
 * can accumulate under the pre-0014 sync race), prove the dedupe keeps exactly
 * the right row and the new unique index then holds.
 *
 * This is deliberately narrow — it guards the one migration that mutates
 * existing auth data, not a whole-database rehearsal. Unlike the previous
 * version (which carried a hand-copied transcript of the migration), this
 * script reads the actual migration SQL from the migrations directory, splits
 * on --> statement-breakpoint, and executes the real statements. A change to
 * the migration is automatically exercised on the next run.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm -C packages/lib exec tsx scripts/verify-membership-dedupe.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is required");
	process.exit(2);
}
if (!/localhost|127\.0\.0\.1/.test(DATABASE_URL) && process.env.ALLOW_REMOTE_DB !== "1") {
	console.error("Refusing to run against a non-local database (set ALLOW_REMOTE_DB=1 to override)");
	process.exit(2);
}

const ORG = "dedupe-verify-org";
const USER = "dedupe-verify-user";

/**
 * Read the real migration SQL and split on --> statement-breakpoint.
 * The file lives in the same package as this script.
 */
function readMigrationStatements(): string[] {
	const path = resolve(__dirname, "../src/db/migrations/0014_membership_uniqueness.sql");
	const contents = readFileSync(path, "utf-8");
	// The first statement is typically SET lock_timeout; keep all of them.
	return contents
		.split("--> statement-breakpoint")
		.map((s) => s.trim())
		.filter(Boolean);
}

function assert(condition: boolean, message: string): void {
	if (!condition) {
		console.error(`✗ ${message}`);
		process.exit(1);
	}
	console.log(`✓ ${message}`);
}

async function main(): Promise<void> {
	const statements = readMigrationStatements();
	console.log(`Read ${statements.length} statement(s) from 0014_membership_uniqueness.sql`);

	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();
	try {
		await client.query("DELETE FROM member WHERE organization_id = $1", [ORG]);
		await client.query("DELETE FROM organization WHERE id = $1", [ORG]);
		await client.query("DELETE FROM \"user\" WHERE id = $1", [USER]);
		await client.query(
			`INSERT INTO organization (id, name, slug, created_at) VALUES ($1, 'Dedupe Verify', $1, NOW())`,
			[ORG],
		);
		await client.query(
			`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
			 VALUES ($1, 'Dedupe Verify', 'dedupe-verify@example.com', true, NOW(), NOW())`,
			[USER],
		);

		// Drop the unique index so we can plant the duplicates a pre-0014 install
		// would have, then re-create it after dedupe exactly as the migration does.
		await client.query('DROP INDEX IF EXISTS "member_organization_id_user_id_uidx"');
		await client.query(
			`INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
			 ('m-member-newer', $1, $2, 'member', TIMESTAMPTZ '2026-03-01'),
			 ('m-admin-oldest', $1, $2, 'admin',  TIMESTAMPTZ '2026-01-01'),
			 ('m-admin-newer',  $1, $2, 'admin',  TIMESTAMPTZ '2026-02-01')`,
			[ORG, USER],
		);

		// Run each statement from the migration in order. The dedupe CTE comes
		// after the SET timeout calls — execute everything.
		for (const stmt of statements) {
			await client.query(stmt);
		}

		const { rows } = await client.query("SELECT id FROM member WHERE organization_id = $1 AND user_id = $2", [
			ORG,
			USER,
		]);
		assert(rows.length === 1, `dedupe collapses duplicates to one row (got ${rows.length})`);
		// admin outranks member; among admins the oldest created_at wins.
		assert(rows[0]?.id === "m-admin-oldest", `dedupe keeps most-privileged, then oldest (kept ${rows[0]?.id})`);

		let rejected = false;
		try {
			await client.query(
				`INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('m-dup', $1, $2, 'member', NOW())`,
				[ORG, USER],
			);
		} catch {
			rejected = true;
		}
		assert(rejected, "unique index rejects a subsequent duplicate membership");

		await client.query("DELETE FROM member WHERE organization_id = $1", [ORG]);
		await client.query("DELETE FROM organization WHERE id = $1", [ORG]);
		await client.query('DELETE FROM "user" WHERE id = $1', [USER]);
	} finally {
		await client.end();
	}
	console.log("\nMembership dedupe verification PASSED");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});