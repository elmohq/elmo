#!/usr/bin/env tsx
/**
 * Backfill script for Phase 2 of the Tinybird-to-Postgres migration.
 *
 * 1. Backfills `brand_id` on `prompt_runs` rows where it's NULL (single UPDATE).
 * 2. Backfills the `citations` table entirely in SQL using jsonb_array_elements
 *    to extract citation data from raw_output — no data leaves the database.
 *
 * Safe to run while the worker is live. Idempotent and restartable.
 *
 * Requires a writable database connection — set BACKFILL_DATABASE_URL,
 * DIRECT_DATABASE_URL, or DATABASE_URL (checked in that order).
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/backfill-brand-id-and-citations.ts
 *   pnpm tsx --env-file=.env scripts/backfill-brand-id-and-citations.ts --dry-run
 *   pnpm tsx --env-file=.env scripts/backfill-brand-id-and-citations.ts --brand-id-only
 *   pnpm tsx --env-file=.env scripts/backfill-brand-id-and-citations.ts --citations-only
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

const SQL_BATCH_SIZE = 10_000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const brandIdOnly = args.includes("--brand-id-only");
const citationsOnly = args.includes("--citations-only");

const connectionString =
	process.env.BACKFILL_DATABASE_URL ??
	process.env.DIRECT_DATABASE_URL ??
	process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error("BACKFILL_DATABASE_URL, DIRECT_DATABASE_URL, or DATABASE_URL is required");
}

const db = drizzle(connectionString);

function redactConnectionString(value: string): string {
	return value.replace(/:[^@]+@/, ":***@");
}

let interrupted = false;
process.on("SIGINT", () => {
	console.log("\nInterrupt received, finishing current batch...");
	interrupted = true;
});

async function assertWritableConnection(): Promise<void> {
	const { rows } = await db.execute<{ transaction_read_only: string }>(
		sql`SHOW transaction_read_only`,
	);
	const isReadOnly = rows[0]?.transaction_read_only === "on";

	if (isReadOnly && !dryRun) {
		throw new Error(
			[
				"Connected database session is read-only.",
				"Use a writable primary connection, e.g. set BACKFILL_DATABASE_URL or DIRECT_DATABASE_URL.",
				`Current connection: ${redactConnectionString(connectionString)}`,
			].join(" "),
		);
	}

	console.log(`  transaction_read_only: ${rows[0]?.transaction_read_only ?? "unknown"}`);
}

// ============================================================================
// brand_id backfill — single UPDATE
// ============================================================================

async function backfillBrandId(): Promise<void> {
	console.log("\n=== Backfilling brand_id on prompt_runs ===");

	const { rows: [{ count: totalNull }] } = await db.execute<{ count: number }>(
		sql`SELECT count(*)::int as count FROM prompt_runs WHERE brand_id IS NULL`,
	);
	console.log(`Rows with NULL brand_id: ${totalNull}`);

	if (totalNull === 0) {
		console.log("Nothing to backfill.");
		return;
	}

	if (dryRun) {
		console.log("[DRY RUN] Would update these rows. Exiting.");
		return;
	}

	console.log("Running single UPDATE...");
	const start = performance.now();

	const { rows } = await db.execute<{ count: number }>(sql`
		WITH updated AS (
			UPDATE prompt_runs
			SET brand_id = p.brand_id
			FROM prompts p
			WHERE prompt_runs.prompt_id = p.id
			  AND prompt_runs.brand_id IS NULL
			RETURNING 1
		)
		SELECT count(*)::int AS count FROM updated
	`);

	const elapsed = Math.round(performance.now() - start);
	console.log(`brand_id backfill complete: ${rows[0].count} rows updated in ${elapsed}ms.`);
}

// ============================================================================
// citations backfill — batched pure-SQL, no data leaves the database
// ============================================================================

async function findResumeCursor(modelGroup: string): Promise<string> {
	const { rows } = await db.execute<{ max_id: string }>(sql`
		SELECT prompt_run_id::text as max_id
		FROM citations
		WHERE "modelGroup" = ${modelGroup}::model_groups
		ORDER BY prompt_run_id DESC
		LIMIT 1
	`);
	return rows[0]?.max_id ?? "00000000-0000-0000-0000-000000000000";
}

async function backfillOpenAIBatch(cursor: string): Promise<{ inserted: number; batchSize: number; nextCursor: string | null }> {
	const { rows: [result] } = await db.execute<{ inserted_count: number; batch_size: number; max_id: string | null }>(sql`
		WITH batch_runs AS (
			SELECT id, prompt_id, brand_id, "modelGroup", raw_output, created_at
			FROM prompt_runs
			WHERE "modelGroup" = 'openai'
				AND brand_id IS NOT NULL
				AND id > ${cursor}::uuid
			ORDER BY id
			LIMIT ${SQL_BATCH_SIZE}
		),
		inserted AS (
			INSERT INTO citations (id, prompt_run_id, prompt_id, brand_id, "modelGroup", url, domain, title, citation_index, created_at)
			SELECT
				gen_random_uuid(),
				pr.id,
				pr.prompt_id,
				pr.brand_id,
				pr."modelGroup",
				annotation->>'url',
				regexp_replace(
					split_part(split_part(annotation->>'url', '://', 2), '/', 1),
					'^www\.', '', 'i'
				),
				NULLIF(annotation->>'title', ''),
				(row_number() OVER (PARTITION BY pr.id ORDER BY content_idx, ann_idx)) - 1,
				pr.created_at
			FROM batch_runs pr,
				jsonb_array_elements(pr.raw_output::jsonb->'output') WITH ORDINALITY AS output_item(val, idx),
				jsonb_array_elements(output_item.val->'content') WITH ORDINALITY AS content_item(val, content_idx),
				jsonb_array_elements(content_item.val->'annotations') WITH ORDINALITY AS annotation_item(val, ann_idx),
				LATERAL (SELECT annotation_item.val AS annotation) AS a
			WHERE output_item.val->>'type' = 'message'
				AND content_item.val->>'type' = 'output_text'
				AND annotation_item.val->>'type' = 'url_citation'
				AND annotation_item.val->>'url' IS NOT NULL
				AND split_part(split_part(annotation_item.val->>'url', '://', 2), '/', 1) != ''
			ON CONFLICT DO NOTHING
			RETURNING 1
		)
		SELECT
			(SELECT count(*)::int FROM inserted) AS inserted_count,
			(SELECT count(*)::int FROM batch_runs) AS batch_size,
			(SELECT id::text FROM batch_runs ORDER BY id DESC LIMIT 1) AS max_id
	`);

	return {
		inserted: result.inserted_count,
		batchSize: result.batch_size,
		nextCursor: result.max_id,
	};
}

async function backfillGoogleBatch(cursor: string): Promise<{ inserted: number; batchSize: number; nextCursor: string | null }> {
	const { rows: [result] } = await db.execute<{ inserted_count: number; batch_size: number; max_id: string | null }>(sql`
		WITH batch_runs AS (
			SELECT id, prompt_id, brand_id, "modelGroup", raw_output, created_at
			FROM prompt_runs
			WHERE "modelGroup" = 'google'
				AND brand_id IS NOT NULL
				AND id > ${cursor}::uuid
			ORDER BY id
			LIMIT ${SQL_BATCH_SIZE}
		),
		inserted AS (
			INSERT INTO citations (id, prompt_run_id, prompt_id, brand_id, "modelGroup", url, domain, title, citation_index, created_at)
			SELECT
				gen_random_uuid(),
				pr.id,
				pr.prompt_id,
				pr.brand_id,
				pr."modelGroup",
				ref->>'url',
				regexp_replace(
					split_part(split_part(ref->>'url', '://', 2), '/', 1),
					'^www\.', '', 'i'
				),
				NULLIF(ref->>'title', ''),
				(row_number() OVER (PARTITION BY pr.id ORDER BY ref_idx)) - 1,
				pr.created_at
			FROM batch_runs pr,
				jsonb_array_elements(pr.raw_output::jsonb->'tasks') WITH ORDINALITY AS task_item(val, task_idx),
				jsonb_array_elements(task_item.val->'result') WITH ORDINALITY AS result_item(val, result_idx),
				jsonb_array_elements(result_item.val->'items') WITH ORDINALITY AS item(val, item_idx),
				jsonb_array_elements(item.val->'references') WITH ORDINALITY AS ref_item(val, ref_idx),
				LATERAL (SELECT ref_item.val AS ref) AS r
			WHERE item.val->>'type' = 'ai_overview'
				AND ref_item.val->>'url' IS NOT NULL
				AND split_part(split_part(ref_item.val->>'url', '://', 2), '/', 1) != ''
			ON CONFLICT DO NOTHING
			RETURNING 1
		)
		SELECT
			(SELECT count(*)::int FROM inserted) AS inserted_count,
			(SELECT count(*)::int FROM batch_runs) AS batch_size,
			(SELECT id::text FROM batch_runs ORDER BY id DESC LIMIT 1) AS max_id
	`);

	return {
		inserted: result.inserted_count,
		batchSize: result.batch_size,
		nextCursor: result.max_id,
	};
}

async function backfillCitationsForModel(
	modelGroup: "openai" | "google",
	totalRuns: number,
	batchFn: (cursor: string) => Promise<{ inserted: number; batchSize: number; nextCursor: string | null }>,
): Promise<number> {
	let cursor = await findResumeCursor(modelGroup);
	const isResuming = cursor !== "00000000-0000-0000-0000-000000000000";

	if (isResuming) {
		console.log(`  Resuming ${modelGroup} from cursor: ${cursor.slice(0, 8)}...`);
	}

	if (dryRun) {
		console.log(`  [DRY RUN] Would process ${modelGroup} rows.`);
		return 0;
	}

	let totalInserted = 0;
	let totalProcessed = 0;
	const start = performance.now();

	while (!interrupted) {
		const { inserted, batchSize, nextCursor } = await batchFn(cursor);
		if (!nextCursor || batchSize === 0) break;

		cursor = nextCursor;
		totalInserted += inserted;
		totalProcessed += batchSize;

		const elapsed = Math.max(Math.round((performance.now() - start) / 1000), 1);
		const rate = Math.round(totalProcessed / elapsed);
		console.log(
			`  ${modelGroup}: ${totalProcessed}/${totalRuns} runs, ${totalInserted} citations (${rate} runs/s, cursor: ${cursor.slice(0, 8)}...)`,
		);
	}

	const elapsed = Math.round((performance.now() - start) / 1000);
	console.log(`  ${modelGroup} done: ${totalInserted} citations from ${totalProcessed} runs in ${elapsed}s`);
	return totalInserted;
}

async function backfillCitations(): Promise<void> {
	console.log("\n=== Backfilling citations table (batched SQL) ===");

	// Raise statement timeout for this session (default pooler timeout is often 60-120s)
	await db.execute(sql`SET statement_timeout = '300s'`);

	const { rows: [{ openai_count, google_count, other_count }] } = await db.execute<{
		openai_count: number;
		google_count: number;
		other_count: number;
	}>(sql`
		SELECT
			count(*) FILTER (WHERE "modelGroup" = 'openai')::int as openai_count,
			count(*) FILTER (WHERE "modelGroup" = 'google')::int as google_count,
			count(*) FILTER (WHERE "modelGroup" NOT IN ('openai', 'google'))::int as other_count
		FROM prompt_runs
		WHERE brand_id IS NOT NULL
	`);

	const { rows: [{ count: existingCitations }] } = await db.execute<{ count: number }>(
		sql`SELECT count(*)::int as count FROM citations`,
	);

	console.log(`  OpenAI runs: ${openai_count}`);
	console.log(`  Google runs: ${google_count}`);
	console.log(`  Other runs: ${other_count} (skipped, no structured citations)`);
	console.log(`  Existing citations: ${existingCitations}`);
	console.log(`  Batch size: ${SQL_BATCH_SIZE} prompt_runs per SQL statement\n`);

	const openaiInserted = await backfillCitationsForModel("openai", openai_count, backfillOpenAIBatch);

	if (!interrupted) {
		const googleInserted = await backfillCitationsForModel("google", google_count, backfillGoogleBatch);

		const { rows: [{ count: finalCount }] } = await db.execute<{ count: number }>(
			sql`SELECT count(*)::int as count FROM citations`,
		);
		console.log(`\nCitations backfill complete. Total citations: ${finalCount} (was ${existingCitations}, +${openaiInserted + googleInserted})`);
	}
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	console.log("Backfill script started");
	console.log(`  Connection: ${redactConnectionString(connectionString)}`);
	console.log(`  Dry run: ${dryRun}`);
	console.log(`  Brand ID only: ${brandIdOnly}`);
	console.log(`  Citations only: ${citationsOnly}`);

	await assertWritableConnection();

	if (!citationsOnly) {
		await backfillBrandId();
	}

	if (!brandIdOnly) {
		await backfillCitations();
	}

	console.log("\nDone.");
	process.exit(0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
