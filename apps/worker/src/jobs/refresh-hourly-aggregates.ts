/**
 * Worker job that maintains the `hourly_*` aggregate tables.
 *
 * Runs every minute via pg-boss. Each tick:
 *
 *   1. Acquires an advisory lock (singletonKey on pg-boss is the primary
 *      guard; the lock is belt-and-suspenders against a stale schedule).
 *   2. Reads `aggregate_refresh_state.last_refreshed_through`.
 *   3. Finds (brand_id, UTC date) buckets touched by inserts in the
 *      window `[last_refreshed_through - 1 h, now() - 30 s]`. The 1-hour
 *      overlap absorbs late-arriving inserts that landed between the
 *      previous tick's read and its commit.
 *   4. For each affected bucket, DELETE+INSERT all four hourly tables
 *      atomically inside a single transaction.
 *   5. Advances `last_refreshed_through` to the upper bound and records
 *      success metadata. On error, the transaction rolls back so the
 *      next tick re-runs the same window; failure metadata is written
 *      separately so it's visible even after rollback.
 *
 * See docs/perf-daily-aggregates.md for the design rationale.
 */
import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { rebuildBucket } from "./rebuild-hourly-bucket";

export interface RefreshHourlyAggregatesData {
	source?: string; // "scheduled" | "manual"
}

const ADVISORY_LOCK_KEY = "refresh-hourly-aggregates";
const OVERLAP_MINUTES = 60; // re-scan the last hour to catch late inserts
const TRAILING_SECONDS = 30; // keep upper bound `now() - 30s` so in-flight writers don't race

export async function refreshHourlyAggregatesJob(
	jobs: Job<RefreshHourlyAggregatesData>[],
): Promise<void> {
	for (const job of jobs) {
		const source = job.data?.source ?? "scheduled";
		try {
			await runRefreshTick(source);
		} catch (error) {
			console.error("[refresh-hourly-aggregates] tick failed:", error);
			throw error; // pg-boss will retry per its retry policy
		}
	}
}

async function runRefreshTick(source: string): Promise<void> {
	const tickStartedAt = new Date();
	let bucketCount = 0;

	try {
		await db.transaction(async (tx) => {
			// Block any concurrent worker tick (pg-boss singletonKey should
			// already prevent it; this catches edge cases like manual triggers).
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ADVISORY_LOCK_KEY}))`);

			await tx.execute(sql`
				UPDATE aggregate_refresh_state
				SET last_run_started_at = ${tickStartedAt}, last_run_status = 'in_progress'
				WHERE id = 1
			`);

			const stateRows = (await tx.execute(sql`
				SELECT last_refreshed_through FROM aggregate_refresh_state WHERE id = 1
			`)).rows as { last_refreshed_through: Date | string }[];
			if (stateRows.length === 0) {
				throw new Error("aggregate_refresh_state row missing — did the migration run?");
			}
			const lastRefreshed = new Date(stateRows[0].last_refreshed_through);

			const lowerBound = new Date(lastRefreshed.getTime() - OVERLAP_MINUTES * 60 * 1000);
			const upperBound = new Date(Date.now() - TRAILING_SECONDS * 1000);

			if (upperBound <= lastRefreshed) {
				// Nothing to do this tick (clock skew or extremely fresh state).
				console.log(
					`[refresh-hourly-aggregates] nothing to do (lastRefreshed=${lastRefreshed.toISOString()}, upperBound=${upperBound.toISOString()})`,
				);
				return;
			}

			const affected = (await tx.execute(sql`
				SELECT DISTINCT brand_id, ((created_at AT TIME ZONE 'UTC')::date)::text AS d
				FROM (
					SELECT brand_id, created_at FROM prompt_runs
						WHERE created_at >= ${lowerBound} AND created_at < ${upperBound}
					UNION
					SELECT brand_id, created_at FROM citations
						WHERE created_at >= ${lowerBound} AND created_at < ${upperBound}
				) s
				ORDER BY brand_id, d
			`)).rows as { brand_id: string; d: string }[];

			bucketCount = affected.length;

			for (const { brand_id: brandId, d: dateStr } of affected) {
				await rebuildBucket(tx, brandId, dateStr);
			}

			await tx.execute(sql`
				UPDATE aggregate_refresh_state
				SET last_refreshed_through = ${upperBound},
					last_run_finished_at = ${new Date()},
					last_run_status = 'success',
					last_run_error = NULL,
					last_affected_buckets = ${bucketCount}
				WHERE id = 1
			`);
		});

		const elapsed = Date.now() - tickStartedAt.getTime();
		console.log(
			`[refresh-hourly-aggregates] tick complete (source=${source}, buckets=${bucketCount}, ${elapsed} ms)`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		// Record failure outside the rolled-back transaction so it's observable.
		try {
			await db.execute(sql`
				UPDATE aggregate_refresh_state
				SET last_run_finished_at = ${new Date()},
					last_run_status = 'failed',
					last_run_error = ${message}
				WHERE id = 1
			`);
		} catch (logErr) {
			console.error("[refresh-hourly-aggregates] failed to record error:", logErr);
		}
		throw error;
	}
}
