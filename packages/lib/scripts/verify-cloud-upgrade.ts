import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Client, Pool } = pg;
const UPGRADE_DATABASE_NAME = "elmo_cloud_upgrade";
const LEGACY_LAST_MIGRATION = "0011_secrets";
const CLOUD_MIGRATIONS = [
	"0012_cloud_tracking_control_plane",
	"0013_better_auth_stripe",
	"0014_enforce_tracking_tenant_budgets",
	"0015_reconcile_entitlement_transitions",
	"0016_durable_billing_mutations",
	"0017_organization_api_keys",
	"0018_bounded_brand_analysis",
] as const;

type Journal = {
	version: string;
	dialect: string;
	entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
};

function requiredEnvironment(name: "DATABASE_URL" | "UPGRADE_DATABASE_URL"): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

function assertDedicatedCiDatabase(adminUrl: string, upgradeUrl: string): void {
	if (process.env.CI !== "true") throw new Error("The cloud upgrade rehearsal is CI-only.");
	const admin = new URL(adminUrl);
	const upgrade = new URL(upgradeUrl);
	assert.notEqual(upgrade.href, admin.href, "Upgrade verification must not use the ordinary migration database.");
	assert.equal(upgrade.host, admin.host, "The admin and upgrade URLs must target the same PostgreSQL server.");
	assert.notEqual(
		decodeURIComponent(admin.pathname.slice(1)),
		UPGRADE_DATABASE_NAME,
		"DATABASE_URL must not target the database that the rehearsal recreates.",
	);
	assert.equal(
		decodeURIComponent(upgrade.pathname.slice(1)),
		UPGRADE_DATABASE_NAME,
		"UPGRADE_DATABASE_URL must target the dedicated elmo_cloud_upgrade database.",
	);
}

async function recreateUpgradeDatabase(adminUrl: string): Promise<void> {
	const client = new Client({ connectionString: adminUrl });
	await client.connect();
	try {
		await client.query(`DROP DATABASE IF EXISTS "${UPGRADE_DATABASE_NAME}" WITH (FORCE)`);
		await client.query(`CREATE DATABASE "${UPGRADE_DATABASE_NAME}"`);
	} finally {
		await client.end();
	}
}

async function createFilteredMigrationFolder(
	sourceFolder: string,
	journal: Journal,
	tags: readonly string[],
): Promise<string> {
	const folder = await mkdtemp(join(tmpdir(), "elmo-upgrade-migrations-"));
	await mkdir(join(folder, "meta"));
	const entries = journal.entries.filter((entry) => tags.includes(entry.tag));
	assert.equal(entries.length, tags.length, "Every requested migration must exist in the journal.");
	await writeFile(join(folder, "meta", "_journal.json"), `${JSON.stringify({ ...journal, entries }, null, 2)}\n`);
	for (const entry of entries) {
		await copyFile(join(sourceFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
	}
	return folder;
}

async function applyMigrations(databaseUrl: string, migrationsFolder: string): Promise<void> {
	const pool = new Pool({ connectionString: databaseUrl, max: 1 });
	try {
		await migrate(drizzle(pool), { migrationsFolder });
	} finally {
		await pool.end();
	}
}

async function seedLegacyInstall(client: InstanceType<typeof Client>): Promise<void> {
	await client.query("BEGIN");
	try {
		await client.query(`
			INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at", "role")
			VALUES
				('local-user', 'Local Owner', 'local@example.test', true, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'admin'),
				('white-user', 'White Label Admin', 'admin@customer.example', true, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', NULL),
				('white-member', 'White Label Member', 'member@customer.example', true, '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z', NULL)
		`);
		await client.query(`
			INSERT INTO "organization" ("id", "name", "slug", "created_at", "metadata")
			VALUES
				('local-brand', 'Local workspace', 'local-workspace', '2026-01-01T00:00:00Z', '{"deployment":"local"}'),
				('white-brand', 'Customer workspace', 'customer-workspace', '2026-01-02T00:00:00Z', '{"deployment":"whitelabel"}')
		`);
		await client.query(`
			INSERT INTO "member" ("id", "organization_id", "user_id", "role", "created_at")
			VALUES
				('local-member-old', 'local-brand', 'local-user', 'member', '2026-01-01T00:00:00Z'),
				('local-owner-new', 'local-brand', 'local-user', 'owner', '2026-01-02T00:00:00Z'),
				('white-admin-old', 'white-brand', 'white-user', 'admin', '2026-01-01T00:00:00Z'),
				('white-admin-new', 'white-brand', 'white-user', 'admin', '2026-01-02T00:00:00Z'),
				('white-member', 'white-brand', 'white-member', 'member', '2026-01-03T00:00:00Z')
		`);
		await client.query(`
			INSERT INTO "brands" (
				"id", "name", "website", "enabled", "onboarded", "delay_override_hours",
				"enabled_models", "additional_domains", "aliases", "organization_id", "created_at", "updated_at"
			)
			VALUES
				('local-brand', 'Local Brand', 'https://local.example', true, true, 18,
					ARRAY['chatgpt', 'perplexity'], ARRAY['local-alt.example'], ARRAY['Local Alias'],
					'local-brand', '2026-01-01T00:00:00Z', '2026-01-04T00:00:00Z'),
				('white-brand', 'Revenue Customer', 'https://customer.example', true, true, 6,
					ARRAY['chatgpt', 'google-ai-mode', 'claude'], ARRAY['customer-alt.example'], ARRAY['Customer Alias'],
					'white-brand', '2026-01-02T00:00:00Z', '2026-01-05T00:00:00Z')
		`);
		await client.query(`
			INSERT INTO "prompts" ("id", "brand_id", "value", "enabled", "tags", "system_tags", "created_at", "updated_at")
			VALUES
				('10000000-0000-4000-8000-000000000001', 'local-brand', 'What is Local Brand?', true,
					ARRAY['local'], ARRAY['branded'], '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z'),
				('10000000-0000-4000-8000-000000000002', 'white-brand', 'Compare the customer category', true,
					ARRAY['customer', 'comparison'], ARRAY['non-branded'], '2026-01-02T00:00:00Z', '2026-01-04T00:00:00Z'),
				('10000000-0000-4000-8000-000000000003', 'white-brand', 'Disabled historical prompt', false,
					ARRAY['historical'], ARRAY[]::text[], '2026-01-02T00:00:00Z', '2026-01-04T00:00:00Z')
		`);
		await client.query(`
			INSERT INTO "competitors" ("id", "brand_id", "name", "domains", "aliases", "created_at", "updated_at")
			VALUES ('20000000-0000-4000-8000-000000000001', 'white-brand', 'Customer Competitor',
				ARRAY['competitor.example'], ARRAY['Competitor Alias'], '2026-01-02T00:00:00Z', '2026-01-04T00:00:00Z')
		`);
		await client.query(`
			INSERT INTO "prompt_runs" (
				"id", "prompt_id", "brand_id", "model", "provider", "version", "web_search_enabled",
				"raw_output", "web_queries", "brand_mentioned", "competitors_mentioned", "created_at"
			)
			VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
				'white-brand', 'chatgpt', 'direct', 'legacy-version', true, '{"answer":"legacy"}',
				ARRAY['legacy query'], true, ARRAY['Customer Competitor'], '2026-01-06T00:00:00Z')
		`);
		await client.query(`
			INSERT INTO "citations" (
				"id", "prompt_run_id", "prompt_id", "brand_id", "model", "url", "domain", "title",
				"citation_index", "created_at"
			)
			VALUES ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
				'10000000-0000-4000-8000-000000000002', 'white-brand', 'chatgpt',
				'https://customer.example/legacy', 'customer.example', 'Legacy citation', 0, '2026-01-06T00:00:00Z')
		`);
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	}
}

async function readLegacySnapshot(client: InstanceType<typeof Client>) {
	const queries = [
		`SELECT "id", "name", "email", "email_verified", "role" FROM "user" ORDER BY "id"`,
		`SELECT "id", "name", "slug", "metadata" FROM "organization" ORDER BY "id"`,
		`SELECT "id", "name", "website", "enabled", "onboarded", "delay_override_hours", "enabled_models",
			"additional_domains", "aliases", "organization_id" FROM "brands" ORDER BY "id"`,
		`SELECT "id", "brand_id", "value", "enabled", "tags", "system_tags" FROM "prompts" ORDER BY "id"`,
		`SELECT "id", "brand_id", "name", "domains", "aliases" FROM "competitors" ORDER BY "id"`,
		`SELECT "id", "prompt_id", "brand_id", "model", "provider", "version", "web_search_enabled",
			"raw_output", "web_queries", "brand_mentioned", "competitors_mentioned" FROM "prompt_runs" ORDER BY "id"`,
		`SELECT "id", "prompt_run_id", "prompt_id", "brand_id", "model", "url", "domain", "title",
			"citation_index" FROM "citations" ORDER BY "id"`,
	] as const;
	return Promise.all(queries.map(async (query) => (await client.query(query)).rows));
}

async function assertCloudUpgrade(
	client: InstanceType<typeof Client>,
	before: Awaited<ReturnType<typeof readLegacySnapshot>>,
) {
	assert.deepEqual(await readLegacySnapshot(client), before, "Cloud expand migrations changed legacy data.");

	const members = (
		await client.query(`
			SELECT "id", "organization_id", "user_id", "role"
			FROM "member"
			ORDER BY "organization_id", "user_id", "id"
		`)
	).rows;
	assert.deepEqual(members, [
		{ id: "local-owner-new", organization_id: "local-brand", user_id: "local-user", role: "owner" },
		{ id: "white-admin-old", organization_id: "white-brand", user_id: "white-user", role: "admin" },
		{ id: "white-member", organization_id: "white-brand", user_id: "white-member", role: "member" },
	]);
	await assert.rejects(
		client.query(`
			INSERT INTO "member" ("id", "organization_id", "user_id", "role", "created_at")
			VALUES ('duplicate-after-upgrade', 'white-brand', 'white-user', 'member', now())
		`),
		/duplicate key value|unique constraint/i,
	);

	const relationshipCount = await client.query(`
		SELECT count(*)::int AS "value"
		FROM "citations" c
		JOIN "prompt_runs" r ON r."id" = c."prompt_run_id" AND r."prompt_id" = c."prompt_id" AND r."brand_id" = c."brand_id"
		JOIN "prompts" p ON p."id" = r."prompt_id" AND p."brand_id" = r."brand_id"
		JOIN "brands" b ON b."id" = p."brand_id" AND b."organization_id" IN ('local-brand', 'white-brand')
	`);
	assert.equal(relationshipCount.rows[0]?.value, 1, "Legacy prompt-run and citation relationships did not survive.");

	const billingColumns = await client.query(`
		SELECT
			(SELECT count(*)::int FROM "organization" WHERE "stripe_customer_id" IS NOT NULL) AS "organizations",
			(SELECT count(*)::int FROM "user" WHERE "stripe_customer_id" IS NOT NULL) AS "users"
	`);
	assert.deepEqual(billingColumns.rows[0], { organizations: 0, users: 0 });
	const billingColumnDefinitions = await client.query(`
		SELECT "table_name", "is_nullable"
		FROM "information_schema"."columns"
		WHERE "table_schema" = 'public'
			AND "column_name" = 'stripe_customer_id'
			AND "table_name" IN ('organization', 'user')
		ORDER BY "table_name"
	`);
	assert.deepEqual(billingColumnDefinitions.rows, [
		{ table_name: "organization", is_nullable: "YES" },
		{ table_name: "user", is_nullable: "YES" },
	]);
	const lifecycleColumn = await client.query(`
		SELECT "is_nullable"
		FROM "information_schema"."columns"
		WHERE "table_schema" = 'public'
			AND "table_name" = 'organization_billing_subscriptions'
			AND "column_name" = 'delinquent_since'
	`);
	assert.deepEqual(lifecycleColumn.rows, [{ is_nullable: "YES" }]);

	const emptyControlPlaneTables = [
		"apikey",
		"subscription",
		"stripe_webhook_events",
		"organization_billing_subscriptions",
		"organization_billing_subscription_items",
		"organization_billing_mutations",
		"organization_entitlement_overrides",
		"organization_entitlement_reconciliations",
		"brand_scheduler_rollouts",
		"brand_target_selections",
		"brand_analysis_admissions",
		"prompt_target_assignments",
		"tracking_schedules",
		"tracking_occurrences",
		"tracking_tasks",
		"tracking_usage_buckets",
		"tracking_provider_attempts",
	] as const;
	for (const table of emptyControlPlaneTables) {
		const result = await client.query(`SELECT count(*)::int AS "value" FROM "${table}"`);
		assert.equal(result.rows[0]?.value, 0, `${table} must remain empty during an existing-install upgrade.`);
	}

	await client.query(`
		INSERT INTO "brand_analysis_admissions" (
			"brand_id", "organization_id", "request_fingerprint", "job_id", "generation", "status"
		) VALUES (
			'white-brand', 'white-brand', repeat('a', 64), '50000000-0000-4000-8000-000000000001', 1, 'pending'
		)
	`);
	await assert.rejects(
		client.query(`
			INSERT INTO "brand_analysis_admissions" (
				"brand_id", "organization_id", "request_fingerprint", "job_id", "generation", "status"
			) VALUES (
				'local-brand', 'local-brand', repeat('b', 64), '50000000-0000-4000-8000-000000000002', 4, 'pending'
			)
		`),
		/check constraint/i,
	);
	await assert.rejects(
		client.query(`
			INSERT INTO "brand_analysis_admissions" (
				"brand_id", "organization_id", "request_fingerprint", "job_id", "generation", "status"
			) VALUES (
				'local-brand', 'white-brand', repeat('c', 64), '50000000-0000-4000-8000-000000000003', 1, 'pending'
			)
		`),
		/foreign key constraint/i,
	);
	await assert.rejects(
		client.query(`
			UPDATE "brand_analysis_admissions"
			SET "status" = 'completed', "result" = '{}'::jsonb, "completed_at" = now()
			WHERE "brand_id" = 'white-brand'
		`),
		/check constraint/i,
	);
	await client.query(`
		UPDATE "brand_analysis_admissions"
		SET "status" = 'running', "provider_started_at" = now()
		WHERE "brand_id" = 'white-brand'
	`);
	await client.query(`
		UPDATE "brand_analysis_admissions"
		SET "status" = 'completed', "result" = '{}'::jsonb, "completed_at" = now()
		WHERE "brand_id" = 'white-brand'
	`);
	await client.query(`DELETE FROM "brand_analysis_admissions" WHERE "brand_id" = 'white-brand'`);
	const admissionCount = await client.query(`SELECT count(*)::int AS "value" FROM "brand_analysis_admissions"`);
	assert.equal(admissionCount.rows[0]?.value, 0, "Brand-analysis constraint rehearsal left control-plane data behind.");

	const rolloutModes = await client.query(`
		SELECT "enumlabel"
		FROM "pg_enum"
		JOIN "pg_type" ON "pg_type"."oid" = "pg_enum"."enumtypid"
		WHERE "pg_type"."typname" = 'scheduler_rollout_mode'
		ORDER BY "pg_enum"."enumsortorder"
	`);
	assert.deepEqual(
		rolloutModes.rows.map((row) => row.enumlabel),
		["legacy", "shadow", "v2", "paused"],
		"The fail-closed cloud rollback mode is missing.",
	);
}

async function main(): Promise<void> {
	const adminUrl = requiredEnvironment("DATABASE_URL");
	const upgradeUrl = requiredEnvironment("UPGRADE_DATABASE_URL");
	assertDedicatedCiDatabase(adminUrl, upgradeUrl);

	const scriptDirectory = dirname(fileURLToPath(import.meta.url));
	const migrationsFolder = join(scriptDirectory, "..", "src", "db", "migrations");
	const journal = JSON.parse(await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8")) as Journal;
	const legacyTags = journal.entries.filter((entry) => entry.idx <= 11).map((entry) => entry.tag);
	assert.equal(legacyTags.at(-1), LEGACY_LAST_MIGRATION);

	const legacyFolder = await createFilteredMigrationFolder(migrationsFolder, journal, legacyTags);
	const cloudFolder = await createFilteredMigrationFolder(migrationsFolder, journal, CLOUD_MIGRATIONS);
	try {
		await recreateUpgradeDatabase(adminUrl);
		await applyMigrations(upgradeUrl, legacyFolder);

		const client = new Client({ connectionString: upgradeUrl });
		await client.connect();
		try {
			await seedLegacyInstall(client);
			const before = await readLegacySnapshot(client);
			await applyMigrations(upgradeUrl, cloudFolder);
			await assertCloudUpgrade(client, before);
		} finally {
			await client.end();
		}
	} finally {
		await Promise.all([
			rm(legacyFolder, { recursive: true, force: true }),
			rm(cloudFolder, { recursive: true, force: true }),
		]);
	}
	console.log("Cloud upgrade rehearsal passed: legacy data stayed intact and cloud control-plane tables stayed empty.");
}

await main();
