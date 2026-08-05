import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { purgeCloudOrganizationProductDataInTransaction } from "../src/cloud/data-retention-purge";
import * as schema from "../src/db/schema";
import { deploymentRuntimeFenceLockId } from "../src/deployment-cutover";
import { transitionDatabaseRuntimeGeneration } from "./runtime-generation";

const { Client, Pool } = pg;
const UPGRADE_DATABASE_NAME = "elmo_cloud_upgrade";
const LEGACY_LAST_MIGRATION = "0011_secrets";
const LEASE_MIGRATION = "0020_lease_cloud_brand_analysis";
const CLOUD_MIGRATIONS = [
	"0012_cloud_tracking_control_plane",
	"0013_better_auth_stripe",
	"0014_enforce_tracking_tenant_budgets",
	"0015_reconcile_entitlement_transitions",
	"0016_durable_billing_mutations",
	"0017_organization_api_keys",
	"0018_bounded_brand_analysis",
	"0019_retain_canceled_cloud_data",
	LEASE_MIGRATION,
] as const;
const PRE_LEASE_CLOUD_MIGRATIONS = CLOUD_MIGRATIONS.slice(0, -1);
const LEASE_MIGRATIONS = [LEASE_MIGRATION] as const;

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

async function assertRuntimeGenerationCutoverProtocol(databaseUrl: string): Promise<void> {
	const source = new Client({ application_name: "elmo-upgrade-rehearsal-source", connectionString: databaseUrl });
	const controller = new Client({
		application_name: "elmo-upgrade-rehearsal-controller",
		connectionString: databaseUrl,
	});
	const target = new Client({ application_name: "elmo-upgrade-rehearsal-target", connectionString: databaseUrl });
	const clients = [source, controller, target];
	const connectedClients: InstanceType<typeof Client>[] = [];
	const sourceLockId = deploymentRuntimeFenceLockId("pre-0020");
	const targetLockId = deploymentRuntimeFenceLockId("0020");
	try {
		for (const client of clients) {
			await client.connect();
			connectedClients.push(client);
		}
		assert.equal(
			(await source.query("SELECT pg_try_advisory_lock_shared($1::bigint) AS acquired", [sourceLockId])).rows[0]
				?.acquired,
			true,
		);
		assert.equal(
			(await controller.query("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [sourceLockId])).rows[0]?.acquired,
			false,
			"The source runtime fence did not block its exclusive cutover controller.",
		);
		assert.equal(
			(await source.query("SELECT pg_advisory_unlock_shared($1::bigint) AS released", [sourceLockId])).rows[0]
				?.released,
			true,
		);
		assert.equal(
			(await controller.query("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [sourceLockId])).rows[0]?.acquired,
			true,
		);

		assert.equal(
			(await target.query("SELECT pg_try_advisory_lock_shared($1::bigint) AS acquired", [targetLockId])).rows[0]
				?.acquired,
			true,
		);
		assert.deepEqual((await target.query(`SELECT generation FROM elmo_runtime_generation`)).rows, [
			{ generation: "0020" },
		]);
		assert.equal(
			(await target.query("SELECT pg_advisory_unlock_shared($1::bigint) AS released", [targetLockId])).rows[0]
				?.released,
			true,
		);
		assert.equal(
			(await controller.query("SELECT pg_advisory_unlock($1::bigint) AS released", [sourceLockId])).rows[0]?.released,
			true,
		);

		assert.equal(
			(await controller.query("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [targetLockId])).rows[0]?.acquired,
			true,
		);
		assert.equal(
			await transitionDatabaseRuntimeGeneration(controller, {
				expectedGeneration: "0020",
				generation: "pre-0020",
			}),
			"changed",
		);
		assert.equal(
			(await controller.query("SELECT pg_advisory_unlock($1::bigint) AS released", [targetLockId])).rows[0]?.released,
			true,
		);
		assert.equal(
			(await source.query("SELECT pg_try_advisory_lock_shared($1::bigint) AS acquired", [sourceLockId])).rows[0]
				?.acquired,
			true,
		);
		assert.deepEqual((await source.query(`SELECT generation FROM elmo_runtime_generation`)).rows, [
			{ generation: "pre-0020" },
		]);
		assert.equal(
			(await source.query("SELECT pg_advisory_unlock_shared($1::bigint) AS released", [sourceLockId])).rows[0]
				?.released,
			true,
		);

		assert.equal(
			(await controller.query("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [sourceLockId])).rows[0]?.acquired,
			true,
		);
		assert.equal(
			await transitionDatabaseRuntimeGeneration(controller, {
				expectedGeneration: "pre-0020",
				generation: "0020",
			}),
			"changed",
		);
		assert.equal(
			(await target.query("SELECT pg_try_advisory_lock_shared($1::bigint) AS acquired", [targetLockId])).rows[0]
				?.acquired,
			true,
		);
		assert.deepEqual((await target.query(`SELECT generation FROM elmo_runtime_generation`)).rows, [
			{ generation: "0020" },
		]);
		assert.equal(
			(await target.query("SELECT pg_advisory_unlock_shared($1::bigint) AS released", [targetLockId])).rows[0]
				?.released,
			true,
		);
		assert.equal(
			(await controller.query("SELECT pg_advisory_unlock($1::bigint) AS released", [sourceLockId])).rows[0]?.released,
			true,
		);
	} finally {
		await Promise.all(
			connectedClients.map(async (client) => {
				await client.query("SELECT pg_advisory_unlock_all()").catch(() => undefined);
				await client.end().catch(() => undefined);
			}),
		);
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

async function seedAndAssertRunningAdmissionLeaseBackfill(
	client: InstanceType<typeof Client>,
	upgradeUrl: string,
	leaseFolder: string,
): Promise<void> {
	await client.query(`
		INSERT INTO "brand_analysis_admissions" (
			"brand_id", "organization_id", "request_fingerprint", "job_id", "generation",
			"status", "provider_started_at"
		) VALUES (
			'white-brand', 'white-brand', repeat('d', 64),
			'50000000-0000-4000-8000-000000000004', 1, 'running', now() - INTERVAL '5 minutes'
		)
	`);
	await applyMigrations(upgradeUrl, leaseFolder);
	const runtimeGeneration = await client.query(`
		SELECT "singleton", "generation"
		FROM "elmo_runtime_generation"
		ORDER BY "singleton"
	`);
	assert.deepEqual(
		runtimeGeneration.rows,
		[{ singleton: true, generation: "0020" }],
		"The 0020 migration must establish exactly one target runtime-generation epoch row.",
	);
	await assertRuntimeGenerationCutoverProtocol(upgradeUrl);
	const admission = await client.query(`
		SELECT
			"status",
			"provider_lease_expires_at" IS NOT NULL AS "has_lease",
			"provider_lease_expires_at" > now() AS "lease_is_future"
		FROM "brand_analysis_admissions"
		WHERE "brand_id" = 'white-brand'
	`);
	assert.deepEqual(admission.rows, [{ status: "running", has_lease: true, lease_is_future: true }]);
	await client.query(`DELETE FROM "brand_analysis_admissions" WHERE "brand_id" = 'white-brand'`);
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
		"organization_data_retention_runs",
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
		SET
			"status" = 'running',
			"provider_started_at" = now(),
			"provider_lease_expires_at" = now() + INTERVAL '30 minutes'
		WHERE "brand_id" = 'white-brand'
	`);
	await client.query(`
		UPDATE "brand_analysis_admissions"
		SET
			"status" = 'completed',
			"result" = '{}'::jsonb,
			"completed_at" = now(),
			"provider_lease_expires_at" = NULL
		WHERE "brand_id" = 'white-brand'
	`);
	await client.query(`DELETE FROM "brand_analysis_admissions" WHERE "brand_id" = 'white-brand'`);
	const admissionCount = await client.query(`SELECT count(*)::int AS "value" FROM "brand_analysis_admissions"`);
	assert.equal(admissionCount.rows[0]?.value, 0, "Brand-analysis constraint rehearsal left control-plane data behind.");

	const retentionColumns = await client.query(`
		SELECT "table_name", "column_name", "is_nullable"
		FROM "information_schema"."columns"
		WHERE "table_schema" = 'public'
			AND (
				("table_name" = 'reports' AND "column_name" = 'organization_id')
				OR ("table_name" = 'tracking_provider_attempts' AND "column_name" IN (
					'task_id', 'brand_id', 'prompt_id', 'retention_run_id'
				))
			)
		ORDER BY "table_name", "column_name"
	`);
	assert.deepEqual(retentionColumns.rows, [
		{ table_name: "reports", column_name: "organization_id", is_nullable: "YES" },
		{ table_name: "tracking_provider_attempts", column_name: "brand_id", is_nullable: "YES" },
		{ table_name: "tracking_provider_attempts", column_name: "prompt_id", is_nullable: "YES" },
		{ table_name: "tracking_provider_attempts", column_name: "retention_run_id", is_nullable: "YES" },
		{ table_name: "tracking_provider_attempts", column_name: "task_id", is_nullable: "YES" },
	]);

	await client.query(`
		INSERT INTO "organization_data_retention_runs" (
			"id", "organization_id", "stripe_customer_id", "stripe_subscription_id",
			"source_subscription_status", "source_subscription_ended_at", "eligible_at",
			"source_subscription_synced_at", "status",
			"scheduled_at", "created_at", "updated_at"
		) VALUES (
			'60000000-0000-4000-8000-000000000001', 'white-brand', 'cus_retention', 'sub_retention',
			'canceled', '2026-06-01T00:00:00Z', '2026-07-31T00:00:00Z',
			'2026-06-01T00:01:00Z', 'scheduled',
			'2026-06-01T00:01:00Z', '2026-06-01T00:01:00Z', '2026-06-01T00:01:00Z'
		)
	`);
	await assert.rejects(
		client.query(`
			INSERT INTO "organization_data_retention_runs" (
				"organization_id", "stripe_customer_id", "stripe_subscription_id",
				"source_subscription_status", "source_subscription_ended_at", "eligible_at",
				"source_subscription_synced_at"
			) VALUES (
				'local-brand', 'cus_invalid', 'sub_invalid',
				'canceled', '2026-06-01T00:00:00Z', '2026-07-30T00:00:00Z',
				'2026-06-01T00:01:00Z'
			)
		`),
		/check constraint/i,
	);
	await assert.rejects(
		client.query(`
			INSERT INTO "organization_data_retention_runs" (
				"organization_id", "stripe_customer_id", "stripe_subscription_id",
				"source_subscription_status", "source_subscription_ended_at", "eligible_at",
				"source_subscription_synced_at"
			) VALUES (
				'local-brand', 'cus_invalid_status', 'sub_invalid_status',
				'active', '2026-06-01T00:00:00Z', '2026-07-31T00:00:00Z',
				'2026-06-01T00:01:00Z'
			)
		`),
		/check constraint/i,
	);
	await assert.rejects(
		client.query(`
			UPDATE "organization_data_retention_runs"
			SET "status" = 'confirmed', "confirmed_at" = '2026-07-30T00:00:00Z'
			WHERE "id" = '60000000-0000-4000-8000-000000000001'
		`),
		/check constraint/i,
	);
	await client.query(`
		UPDATE "organization_data_retention_runs"
		SET "status" = 'canceled', "canceled_at" = '2026-07-30T00:00:00Z',
			"cancel_reason" = 'upgrade-rehearsal'
		WHERE "id" = '60000000-0000-4000-8000-000000000001'
	`);
	await client.query(`DELETE FROM "organization_data_retention_runs" WHERE "organization_id" = 'white-brand'`);
	const retentionCount = await client.query(`SELECT count(*)::int AS "value" FROM "organization_data_retention_runs"`);
	assert.equal(retentionCount.rows[0]?.value, 0, "Retention constraint rehearsal left control-plane data behind.");

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

async function assertCloudRetentionPurge(client: InstanceType<typeof Client>): Promise<void> {
	await client.query("BEGIN");
	try {
		await client.query(`
			INSERT INTO "organization" ("id", "name", "slug", "created_at")
			VALUES ('cloud-retention-org', 'Retention Test', 'cloud-retention-test', '2026-05-01T00:00:00Z')
		`);
		await client.query(`
			INSERT INTO "stripe_webhook_events" (
				"id", "type", "livemode", "stripe_created_at", "payload"
			) VALUES (
				'evt_retention_purge', 'customer.subscription.deleted', false,
				'2026-06-01T00:01:00Z', '{"billing":"audit"}'
			)
		`);
		await client.query(`
			INSERT INTO "organization_billing_subscriptions" (
				"organization_id", "stripe_subscription_id", "stripe_customer_id", "status",
				"base_plan_key", "billing_interval", "currency", "current_period_start", "current_period_end",
				"canceled_at", "ended_at", "source_event_id", "source_event_created_at", "source_snapshot", "synced_at"
			) VALUES (
				'cloud-retention-org', 'sub_retention_purge', 'cus_retention_purge', 'canceled',
				'pro', 'month', 'usd', '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z',
				'2026-05-15T00:00:00Z', '2026-06-01T00:00:00Z', 'evt_retention_purge',
				'2026-06-01T00:01:00Z', '{"billing":"subscription audit"}', '2026-06-01T00:01:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "organization_billing_subscription_items" (
				"stripe_subscription_item_id", "organization_id", "stripe_price_id", "stripe_price_lookup_key",
				"type", "quantity", "active", "source_event_id", "source_event_created_at", "source_snapshot"
			) VALUES (
				'si_retention_purge', 'cloud-retention-org', 'price_retention_purge', 'elmo_cloud_pro_monthly',
				'base_plan', 1, false, 'evt_retention_purge', '2026-06-01T00:01:00Z',
				'{"billing":"item audit"}'
			)
		`);
		await client.query(`
			INSERT INTO "organization_billing_mutations" (
				"id", "organization_id", "mutation_id", "kind", "status", "stripe_subscription_id",
				"stripe_customer_id", "stripe_idempotency_key", "target_plan_key", "target_billing_interval",
				"target_claude_addon_prompt_slots", "stripe_update_params", "completed_at"
			) VALUES (
				'70000000-0000-4000-8000-000000000016', 'cloud-retention-org', 'retention-billing-audit',
				'plan', 'applied', 'sub_retention_purge', 'cus_retention_purge', 'retention-idempotency-key',
				'pro', 'month', 0, '{"billing":"mutation audit"}', '2026-05-01T00:00:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "brands" (
				"id", "name", "website", "organization_id", "created_at", "updated_at"
			) VALUES (
				'cloud-retention-brand', 'Secret Brand', 'https://secret.example', 'cloud-retention-org',
				'2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "prompts" ("id", "brand_id", "value", "created_at", "updated_at")
			VALUES (
				'70000000-0000-4000-8000-000000000001', 'cloud-retention-brand', 'Secret customer prompt',
				'2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "competitors" ("id", "brand_id", "name", "domains", "created_at", "updated_at")
			VALUES (
				'70000000-0000-4000-8000-000000000002', 'cloud-retention-brand', 'Secret Competitor',
				ARRAY['secret-competitor.example'], '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "prompt_runs" (
				"id", "prompt_id", "brand_id", "model", "provider", "version", "web_search_enabled",
				"raw_output", "brand_mentioned", "created_at"
			) VALUES (
				'70000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000001',
				'cloud-retention-brand', 'claude', 'anthropic', 'v1', true,
				'{"answer":"secret raw answer"}', true, '2026-05-01T00:00:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "citations" (
				"id", "prompt_run_id", "prompt_id", "brand_id", "model", "url", "domain",
				"citation_index", "created_at"
			) VALUES (
				'70000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000003',
				'70000000-0000-4000-8000-000000000001', 'cloud-retention-brand', 'claude',
				'https://secret.example/private', 'secret.example', 0, '2026-05-01T00:00:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "brand_opportunities" ("id", "brand_id", "report", "created_at")
			VALUES (
				'70000000-0000-4000-8000-000000000005', 'cloud-retention-brand',
				'{"customer":"secret report"}', '2026-05-01T00:00:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "reports" ("id", "organization_id", "brand_name", "brand_website", "raw_output")
			VALUES (
				'70000000-0000-4000-8000-000000000006', 'cloud-retention-org', 'Secret Brand',
				'https://secret.example', '{"customer":"secret generated report"}'
			)
		`);
		await client.query(`
			INSERT INTO "apikey" ("id", "key", "reference_id", "created_at", "updated_at")
			VALUES ('retention-api-key', 'hashed-secret', 'cloud-retention-org', now(), now())
		`);
		await client.query(`
			INSERT INTO "brand_analysis_admissions" (
				"brand_id", "organization_id", "request_fingerprint", "job_id", "generation", "status"
			) VALUES (
				'cloud-retention-brand', 'cloud-retention-org', repeat('d', 64),
				'70000000-0000-4000-8000-000000000007', 1, 'pending'
			)
		`);
		await client.query(`
			INSERT INTO "brand_target_selections" (
				"id", "brand_id", "target_key", "source", "created_at", "updated_at"
			) VALUES (
				'70000000-0000-4000-8000-000000000008', 'cloud-retention-brand', 'claude-native-web',
				'user', '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "prompt_target_assignments" (
				"id", "brand_id", "prompt_id", "brand_target_selection_id", "target_key", "source",
				"created_at", "updated_at"
			) VALUES (
				'70000000-0000-4000-8000-000000000009', 'cloud-retention-brand',
				'70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000008',
				'claude-native-web', 'brand_selection', '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "brand_scheduler_rollouts" ("brand_id", "mode", "generation")
			VALUES ('cloud-retention-brand', 'v2', 1)
		`);
		await client.query(`
			INSERT INTO "tracking_schedules" (
				"id", "brand_id", "prompt_id", "prompt_target_assignment_id", "target_key",
				"cadence_minutes", "samples_per_occurrence", "generation", "policy_version"
			) VALUES (
				'70000000-0000-4000-8000-000000000010', 'cloud-retention-brand',
				'70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000009',
				'claude-native-web', 1440, 1, 1, 1
			)
		`);
		await client.query(`
			INSERT INTO "tracking_occurrences" (
				"id", "brand_id", "prompt_id", "target_key", "schedule_id", "due_at", "generation",
				"policy_version", "policy_snapshot", "status", "expected_task_count"
			) VALUES (
				'70000000-0000-4000-8000-000000000011', 'cloud-retention-brand',
				'70000000-0000-4000-8000-000000000001', 'claude-native-web',
				'70000000-0000-4000-8000-000000000010', '2026-05-01T00:00:00Z', 1, 1, '{}', 'succeeded', 1
			)
		`);
		await client.query(`
			INSERT INTO "tracking_tasks" (
				"id", "brand_id", "prompt_id", "occurrence_id", "sample_index", "target_key", "status",
				"prompt_run_id"
			) VALUES (
				'70000000-0000-4000-8000-000000000012', 'cloud-retention-brand',
				'70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000011',
				0, 'claude-native-web', 'succeeded', '70000000-0000-4000-8000-000000000003'
			)
		`);
		await client.query(`
			INSERT INTO "tracking_usage_buckets" (
				"id", "organization_id", "usage_class", "quota_key", "period_start", "period_end",
				"limit_units", "used_units"
			) VALUES (
				'70000000-0000-4000-8000-000000000013', 'cloud-retention-org', 'premium',
				'claude-native-web', '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z', 10, 1
			)
		`);
		await client.query(`
			INSERT INTO "organization_data_retention_runs" (
				"id", "organization_id", "stripe_customer_id", "stripe_subscription_id",
				"source_subscription_status", "source_subscription_ended_at", "eligible_at",
				"source_subscription_synced_at", "status",
				"confirmed_at", "purge_after"
			) VALUES (
				'70000000-0000-4000-8000-000000000014', 'cloud-retention-org', 'cus_retention_purge',
				'sub_retention_purge', 'canceled', '2026-06-01T00:00:00Z', '2026-07-31T00:00:00Z',
				'2026-06-01T00:01:00Z', 'confirmed', '2026-07-30T00:00:00Z', '2026-07-31T00:00:00Z'
			)
		`);
		await client.query(`
			INSERT INTO "tracking_provider_attempts" (
				"id", "task_id", "organization_id", "brand_id", "prompt_id", "target_key", "usage_class",
				"usage_bucket_id", "attempt_number", "status", "provider", "model", "web_search_enabled",
				"usage_units", "counts_toward_limit", "quota_period_start", "quota_period_end",
				"provider_request_id", "input_tokens", "output_tokens", "web_search_requests", "cost_microusd",
				"error_code", "error_message", "prompt_run_id"
			) VALUES (
				'70000000-0000-4000-8000-000000000015', '70000000-0000-4000-8000-000000000012',
				'cloud-retention-org', 'cloud-retention-brand', '70000000-0000-4000-8000-000000000001',
				'claude-native-web', 'premium', '70000000-0000-4000-8000-000000000013', 1, 'failed',
				'anthropic', 'claude', true, 1, true, '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z',
				'req_secret', 100, 50, 1, 12345, 'provider_error', 'Secret customer error details',
				'70000000-0000-4000-8000-000000000003'
			)
		`);
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	}

	const database = drizzle(client, { schema });
	const purgeSummary = await database.transaction((tx) =>
		purgeCloudOrganizationProductDataInTransaction(tx, {
			organizationId: "cloud-retention-org",
			retentionRunId: "70000000-0000-4000-8000-000000000014",
			now: new Date("2026-08-01T00:00:00Z"),
		}),
	);
	assert.deepEqual(purgeSummary, {
		apiKeys: 1,
		reports: 1,
		providerAttemptsArchived: 1,
		citations: 1,
		opportunityReports: 1,
		competitors: 1,
		trackingTasks: 1,
		trackingOccurrences: 1,
		trackingSchedules: 1,
		promptTargetAssignments: 1,
		brandTargetSelections: 1,
		brandSchedulerRollouts: 1,
		promptRuns: 1,
		brandAnalysisAdmissions: 1,
		prompts: 1,
		brands: 1,
	});

	const productCounts = await client.query(`
		SELECT
			(SELECT count(*)::int FROM "brands" WHERE "organization_id" = 'cloud-retention-org') AS "brands",
			(SELECT count(*)::int FROM "reports" WHERE "organization_id" = 'cloud-retention-org') AS "reports",
			(SELECT count(*)::int FROM "apikey" WHERE "reference_id" = 'cloud-retention-org') AS "api_keys"
	`);
	assert.deepEqual(productCounts.rows[0], { brands: 0, reports: 0, api_keys: 0 });

	const retainedAttempt = await client.query(`
		SELECT "organization_id", "task_id", "brand_id", "prompt_id", "prompt_run_id",
			"provider_request_id", "error_message", "retention_run_id", "provider", "model",
			"input_tokens", "output_tokens", "web_search_requests", "cost_microusd", "error_code"
		FROM "tracking_provider_attempts"
		WHERE "id" = '70000000-0000-4000-8000-000000000015'
	`);
	assert.deepEqual(retainedAttempt.rows, [
		{
			organization_id: "cloud-retention-org",
			task_id: null,
			brand_id: null,
			prompt_id: null,
			prompt_run_id: null,
			provider_request_id: null,
			error_message: null,
			retention_run_id: "70000000-0000-4000-8000-000000000014",
			provider: "anthropic",
			model: "claude",
			input_tokens: 100,
			output_tokens: 50,
			web_search_requests: 1,
			cost_microusd: "12345",
			error_code: "provider_error",
		},
	]);

	const preservedAudit = await client.query(`
		SELECT
			(SELECT count(*)::int FROM "organization" WHERE "id" = 'cloud-retention-org') AS "organizations",
			(SELECT count(*)::int FROM "stripe_webhook_events"
				WHERE "id" = 'evt_retention_purge') AS "webhook_events",
			(SELECT count(*)::int FROM "organization_billing_subscriptions"
				WHERE "organization_id" = 'cloud-retention-org') AS "billing_subscriptions",
			(SELECT count(*)::int FROM "organization_billing_subscription_items"
				WHERE "organization_id" = 'cloud-retention-org') AS "billing_items",
			(SELECT count(*)::int FROM "organization_billing_mutations"
				WHERE "organization_id" = 'cloud-retention-org') AS "billing_mutations",
			(SELECT count(*)::int FROM "organization_data_retention_runs"
				WHERE "id" = '70000000-0000-4000-8000-000000000014') AS "retention_runs",
			(SELECT count(*)::int FROM "tracking_usage_buckets"
				WHERE "organization_id" = 'cloud-retention-org') AS "usage_buckets"
	`);
	assert.deepEqual(preservedAudit.rows[0], {
		organizations: 1,
		webhook_events: 1,
		billing_subscriptions: 1,
		billing_items: 1,
		billing_mutations: 1,
		retention_runs: 1,
		usage_buckets: 1,
	});
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
	const cloudFolder = await createFilteredMigrationFolder(migrationsFolder, journal, PRE_LEASE_CLOUD_MIGRATIONS);
	const leaseFolder = await createFilteredMigrationFolder(migrationsFolder, journal, LEASE_MIGRATIONS);
	try {
		await recreateUpgradeDatabase(adminUrl);
		await applyMigrations(upgradeUrl, legacyFolder);

		const client = new Client({ connectionString: upgradeUrl });
		await client.connect();
		try {
			await seedLegacyInstall(client);
			const before = await readLegacySnapshot(client);
			await applyMigrations(upgradeUrl, cloudFolder);
			const preUpgradeRuntimeGeneration = await client.query(
				`SELECT to_regclass('public.elmo_runtime_generation')::text AS "runtimeGenerationTable"`,
			);
			assert.deepEqual(
				preUpgradeRuntimeGeneration.rows,
				[{ runtimeGenerationTable: null }],
				"The pre-0020 schema must not advertise the target runtime generation before cutover.",
			);
			await seedAndAssertRunningAdmissionLeaseBackfill(client, upgradeUrl, leaseFolder);
			await assertCloudUpgrade(client, before);
			await assertCloudRetentionPurge(client);
		} finally {
			await client.end();
		}
	} finally {
		await Promise.all([
			rm(legacyFolder, { recursive: true, force: true }),
			rm(cloudFolder, { recursive: true, force: true }),
			rm(leaseFolder, { recursive: true, force: true }),
		]);
	}
	console.log(
		"Cloud upgrade rehearsal passed: legacy product data stayed intact, memberships were normalized, and cloud control-plane tables stayed empty.",
	);
}

await main();
