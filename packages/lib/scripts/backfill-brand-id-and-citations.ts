#!/usr/bin/env tsx
/**
 * Backfill script for Phase 2 of the Tinybird-to-Postgres migration.
 *
 * 1. Backfills `brand_id` on `prompt_runs` rows where it's NULL.
 * 2. Backfills the `citations` table from `raw_output` JSON for rows
 *    that don't yet have citations extracted.
 *
 * Safe to run while the worker is live — uses batched updates with
 * cursor-based pagination. Idempotent and restartable.
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/backfill-brand-id-and-citations.ts
 *   pnpm tsx --env-file=.env scripts/backfill-brand-id-and-citations.ts --dry-run
 *   pnpm tsx --env-file=.env scripts/backfill-brand-id-and-citations.ts --brand-id-only
 *   pnpm tsx --env-file=.env scripts/backfill-brand-id-and-citations.ts --citations-only
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { extractCitations } from "../src/text-extraction";

const BRAND_ID_BATCH_SIZE = 5000;
const CITATIONS_BATCH_SIZE = 500;
const PAUSE_BETWEEN_BATCHES_MS = 100;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const brandIdOnly = args.includes("--brand-id-only");
const citationsOnly = args.includes("--citations-only");

const db = drizzle(process.env.DATABASE_URL!);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

let interrupted = false;
process.on("SIGINT", () => {
	console.log("\nInterrupt received, finishing current batch...");
	interrupted = true;
});

async function backfillBrandId(): Promise<void> {
	console.log("\n=== Backfilling brand_id on prompt_runs ===");

	const [{ count: totalNull }] = await db.execute<{ count: number }>(
		sql`SELECT count(*)::int as count FROM prompt_runs WHERE brand_id IS NULL`,
	);
	console.log(`Rows with NULL brand_id: ${totalNull}`);

	if (dryRun) {
		console.log("[DRY RUN] Would update these rows. Exiting.");
		return;
	}

	if (totalNull === 0) {
		console.log("Nothing to backfill.");
		return;
	}

	let updated = 0;
	let batchNum = 0;

	while (!interrupted) {
		const result = await db.execute<{ updated_count: number }>(sql`
			WITH batch AS (
				SELECT pr.id
				FROM prompt_runs pr
				WHERE pr.brand_id IS NULL
				LIMIT ${BRAND_ID_BATCH_SIZE}
			)
			UPDATE prompt_runs
			SET brand_id = p.brand_id
			FROM prompts p, batch
			WHERE prompt_runs.id = batch.id
			  AND prompt_runs.prompt_id = p.id
			RETURNING 1 as updated_count
		`);

		const batchUpdated = result.length;
		if (batchUpdated === 0) break;

		updated += batchUpdated;
		batchNum++;
		console.log(`  Batch ${batchNum}: updated ${batchUpdated} rows (total: ${updated}/${totalNull})`);

		await sleep(PAUSE_BETWEEN_BATCHES_MS);
	}

	console.log(`brand_id backfill complete: ${updated} rows updated.`);
}

async function backfillCitations(): Promise<void> {
	console.log("\n=== Backfilling citations table ===");

	const [{ count: totalRuns }] = await db.execute<{ count: number }>(
		sql`SELECT count(*)::int as count FROM prompt_runs`,
	);
	const [{ count: existingCitations }] = await db.execute<{ count: number }>(
		sql`SELECT count(DISTINCT prompt_run_id)::int as count FROM citations`,
	);
	console.log(`Total prompt_runs: ${totalRuns}`);
	console.log(`Prompt runs with citations already extracted: ${existingCitations}`);

	if (dryRun) {
		console.log(`[DRY RUN] Would process up to ${totalRuns - existingCitations} rows. Exiting.`);
		return;
	}

	let processed = 0;
	let citationsInserted = 0;
	let cursor = "00000000-0000-0000-0000-000000000000";

	while (!interrupted) {
		const rows = await db.execute<{
			id: string;
			prompt_id: string;
			brand_id: string;
			modelGroup: string;
			raw_output: unknown;
			created_at: string;
		}>(sql`
			SELECT pr.id, pr.prompt_id, pr.brand_id, pr."modelGroup", pr.raw_output, pr.created_at
			FROM prompt_runs pr
			WHERE pr.id > ${cursor}
			  AND pr.brand_id IS NOT NULL
			  AND NOT EXISTS (
			    SELECT 1 FROM citations c WHERE c.prompt_run_id = pr.id
			  )
			ORDER BY pr.id
			LIMIT ${CITATIONS_BATCH_SIZE}
		`);

		if (rows.length === 0) break;

		const citationValues: Array<{
			promptRunId: string;
			promptId: string;
			brandId: string;
			modelGroup: string;
			url: string;
			domain: string;
			title: string | null;
			createdAt: Date;
		}> = [];

		for (const row of rows) {
			const extracted = extractCitations(row.raw_output, row.modelGroup);
			for (const c of extracted) {
				citationValues.push({
					promptRunId: row.id,
					promptId: row.prompt_id,
					brandId: row.brand_id,
					modelGroup: row.modelGroup,
					url: c.url,
					domain: c.domain,
					title: c.title || null,
					createdAt: new Date(row.created_at),
				});
			}
			cursor = row.id;
		}

		if (citationValues.length > 0) {
			const valueSets = citationValues.map(
				(v) =>
					sql`(gen_random_uuid(), ${v.promptRunId}, ${v.promptId}, ${v.brandId}, ${v.modelGroup}::model_groups, ${v.url}, ${v.domain}, ${v.title}, ${v.createdAt})`,
			);

			for (let i = 0; i < valueSets.length; i += 500) {
				const chunk = valueSets.slice(i, i + 500);
				await db.execute(sql`
					INSERT INTO citations (id, prompt_run_id, prompt_id, brand_id, "modelGroup", url, domain, title, created_at)
					VALUES ${sql.join(chunk, sql`, `)}
				`);
			}

			citationsInserted += citationValues.length;
		}

		processed += rows.length;
		console.log(
			`  Processed ${processed} prompt_runs, inserted ${citationsInserted} citations (cursor: ${cursor.slice(0, 8)}...)`,
		);

		await sleep(PAUSE_BETWEEN_BATCHES_MS);
	}

	console.log(`Citations backfill complete: ${processed} prompt_runs processed, ${citationsInserted} citations inserted.`);
}

async function main(): Promise<void> {
	console.log("Backfill script started");
	console.log(`  DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);
	console.log(`  Dry run: ${dryRun}`);
	console.log(`  Brand ID only: ${brandIdOnly}`);
	console.log(`  Citations only: ${citationsOnly}`);

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
