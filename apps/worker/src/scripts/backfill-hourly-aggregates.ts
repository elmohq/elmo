/**
 * One-shot backfill for the `hourly_*` aggregate tables.
 *
 * Usage (from `apps/worker`):
 *   pnpm tsx --env-file=../web/.env src/scripts/backfill-hourly-aggregates.ts
 *
 * Resumable: progress is tracked in `aggregate_refresh_state` via
 * `(backfill_cursor_brand_id, backfill_cursor_date)`. If the script is
 * killed (SIGTERM, crash, deploy, etc.), the next invocation picks up
 * where the last successfully-committed bucket left off.
 *
 * What it does:
 *
 *   1. On first run, sets `backfill_started_at = now()` and clears the
 *      cursor. Subsequent runs detect this state and resume.
 *   2. Computes a snapshot cutoff = `backfill_started_at - 30 s` so the
 *      set of buckets to process is deterministic across resumes.
 *   3. Streams `(brand_id, UTC date)` tuples from `prompt_runs` ∪
 *      `citations`, filtered to `created_at < cutoff` and skipping any
 *      tuples already past the cursor. Sorted lexicographically.
 *   4. For each tuple, runs the same per-bucket rebuild SQL the live
 *      worker uses, in its own transaction. After each commit, the
 *      cursor advances. If the script dies mid-bucket, that bucket
 *      simply re-runs cleanly on resume (DELETE+INSERT is idempotent).
 *   5. When the iterator is exhausted, writes
 *      `backfill_completed_at = now()` and primes the live worker by
 *      setting `last_refreshed_through = backfill_started_at`. The
 *      live worker's first tick then catches up the (typically small)
 *      window between backfill start and now.
 *
 * Safe to run while the live worker is running, though there's no
 * point — they'd contend on the same buckets. Recommended order:
 * apply migration, run backfill to completion, then deploy code that
 * starts the live worker job.
 */
import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";
import { rebuildBucket } from "../jobs/rebuild-hourly-bucket";

const TRAILING_SECONDS = 30;
const PROGRESS_LOG_INTERVAL = 50;

interface StateRow {
	backfill_started_at: Date | null;
	backfill_completed_at: Date | null;
	backfill_cursor_brand_id: string | null;
	backfill_cursor_date: Date | string | null;
}

async function readState(): Promise<StateRow> {
	const rows = (
		await db.execute(sql`
			SELECT backfill_started_at, backfill_completed_at,
				backfill_cursor_brand_id, backfill_cursor_date
			FROM aggregate_refresh_state
			WHERE id = 1
		`)
	).rows as unknown as StateRow[];
	if (rows.length === 0) {
		throw new Error(
			"aggregate_refresh_state row missing — apply migration 0009_hourly_aggregates.sql before running this script.",
		);
	}
	return rows[0];
}

function dateToString(d: Date | string): string {
	if (typeof d === "string") return d.slice(0, 10);
	// Force UTC date string regardless of process TZ.
	return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
	let state = await readState();

	if (state.backfill_completed_at) {
		console.log(
			`[backfill] already completed at ${state.backfill_completed_at.toISOString()} — nothing to do.`,
		);
		console.log(
			"   (delete the row's backfill_completed_at if you really mean to re-run, or TRUNCATE the hourly_* tables and reset state.)",
		);
		return;
	}

	if (!state.backfill_started_at) {
		const now = new Date();
		console.log(`[backfill] fresh start at ${now.toISOString()}`);
		await db.execute(sql`
			UPDATE aggregate_refresh_state
			SET backfill_started_at = ${now},
				backfill_cursor_brand_id = NULL,
				backfill_cursor_date = NULL
			WHERE id = 1
		`);
		state = await readState();
	} else {
		console.log(
			`[backfill] resuming. started_at=${state.backfill_started_at.toISOString()}, ` +
				`cursor=(${state.backfill_cursor_brand_id ?? "null"}, ${
					state.backfill_cursor_date ? dateToString(state.backfill_cursor_date) : "null"
				})`,
		);
	}

	const startedAt = state.backfill_started_at!;
	const cutoff = new Date(startedAt.getTime() - TRAILING_SECONDS * 1000);
	console.log(`[backfill] cutoff = ${cutoff.toISOString()} (snapshot of source rows up to here)`);

	// Use a server-side cursor so we don't load all (brand, date) tuples into
	// memory at once. There can be ~hundreds of thousands of buckets across
	// all tenants in the worst case.
	const cursorBrandId = state.backfill_cursor_brand_id;
	const cursorDate = state.backfill_cursor_date ? dateToString(state.backfill_cursor_date) : null;

	// Tuple comparison `(brand_id, d) > (cursor_brand_id, cursor_date)` is
	// the cleanest resume predicate. NULL tuple means "no cursor yet, start
	// from the beginning."
	const cursorClause =
		cursorBrandId !== null && cursorDate !== null
			? sql`AND (s.brand_id, s.d) > (${cursorBrandId}, ${cursorDate}::date)`
			: sql``;

	// We collect buckets in batches rather than streaming, since `pg` doesn't
	// expose true cursors through the high-level API. Batches are small enough
	// (a few thousand at most for any window) that this is fine.
	const buckets = (
		await db.execute(sql`
			SELECT s.brand_id, (s.d)::text AS d
			FROM (
				SELECT brand_id, (created_at AT TIME ZONE 'UTC')::date AS d
				FROM prompt_runs
				WHERE created_at < ${cutoff}
				UNION
				SELECT brand_id, (created_at AT TIME ZONE 'UTC')::date AS d
				FROM citations
				WHERE created_at < ${cutoff}
			) s
			WHERE TRUE ${cursorClause}
			GROUP BY s.brand_id, s.d
			ORDER BY s.brand_id, s.d
		`)
	).rows as { brand_id: string; d: string }[];

	console.log(`[backfill] ${buckets.length} buckets to process`);
	if (buckets.length === 0) {
		await markCompleted(startedAt);
		console.log("[backfill] done (no buckets to process)");
		return;
	}

	const overallStart = Date.now();
	let processed = 0;

	for (const { brand_id: brandId, d: dateStr } of buckets) {
		const bucketStart = Date.now();
		await db.transaction(async (tx) => {
			await rebuildBucket(tx, brandId, dateStr);
			await tx.execute(sql`
				UPDATE aggregate_refresh_state
				SET backfill_cursor_brand_id = ${brandId},
					backfill_cursor_date = ${dateStr}::date
				WHERE id = 1
			`);
		});
		processed++;
		if (processed % PROGRESS_LOG_INTERVAL === 0) {
			const elapsedMs = Date.now() - overallStart;
			const rate = processed / (elapsedMs / 1000);
			const remaining = buckets.length - processed;
			const etaSec = Math.round(remaining / rate);
			console.log(
				`[backfill] ${processed}/${buckets.length} (${rate.toFixed(1)} buckets/s, ETA ${etaSec}s, last bucket ${Date.now() - bucketStart}ms)`,
			);
		}
	}

	await markCompleted(startedAt);
	const totalSec = ((Date.now() - overallStart) / 1000).toFixed(1);
	console.log(`[backfill] complete: ${processed} buckets in ${totalSec}s`);
	console.log("   The live `refresh-hourly-aggregates` worker will now catch up the gap from");
	console.log(`   ${startedAt.toISOString()} (backfill start) to now on its next tick.`);
}

async function markCompleted(backfillStartedAt: Date): Promise<void> {
	await db.execute(sql`
		UPDATE aggregate_refresh_state
		SET backfill_completed_at = ${new Date()},
			last_refreshed_through = ${backfillStartedAt}
		WHERE id = 1
	`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("[backfill] failed:", err);
		console.error("   Re-run the same command to resume from where it left off.");
		process.exit(1);
	});
