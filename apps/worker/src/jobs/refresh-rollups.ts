import * as Sentry from "@sentry/node";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import {
	claimDirty,
	coalesceMarks,
	type DirtyMark,
	finishBackfillIfDrained,
	type RebuildRange,
	rebuildRange,
	restoreDirty,
} from "@workspace/lib/rollups";
import type { Job } from "pg-boss";

export interface RefreshRollupsData {
	source?: string;
}

const DEFAULT_MAX_MARKS = 200;
const DEFAULT_TIME_BUDGET_MS = 50_000;

export interface RefreshTickResult {
	ranges: number;
	failed: number;
	marksClaimed: number;
}

function reportRebuildFailure(error: unknown, range: RebuildRange): void {
	console.error(
		`[refresh-rollups] rebuild failed for brand ${range.brandId} ${range.from.toISOString()}–${range.toExclusive.toISOString()}:`,
		error,
	);
	Sentry.withScope((scope) => {
		scope.setTag("queue", "refresh-rollups");
		scope.setContext("range", {
			brandId: range.brandId,
			from: range.from.toISOString(),
			toExclusive: range.toExclusive.toISOString(),
			marks: range.marks.length,
		});
		Sentry.captureException(error);
	});
}

/**
 * Rebuilds every range in one claimed batch, in coalesced order. Stops (and
 * restores whatever it hasn't gotten to) the moment the deadline passes, so a
 * slow batch never runs past its budget.
 */
async function processClaimedBatch(
	conn: DbConnection,
	marks: DirtyMark[],
	deadline: number,
): Promise<{ ranges: number; failed: number; timedOut: boolean }> {
	const ranges = coalesceMarks(marks);
	let rebuilt = 0;
	let failed = 0;
	for (let i = 0; i < ranges.length; i++) {
		if (Date.now() > deadline) {
			await restoreDirty(
				conn,
				ranges.slice(i).flatMap((range) => range.marks),
			);
			return { ranges: rebuilt, failed, timedOut: true };
		}
		const range = ranges[i];
		try {
			await rebuildRange(conn, range.brandId, range.from, range.toExclusive);
			rebuilt++;
		} catch (error) {
			await restoreDirty(conn, range.marks);
			failed++;
			reportRebuildFailure(error, range);
		}
	}
	return { ranges: rebuilt, failed, timedOut: false };
}

/**
 * Drains the dirty outbox: claim, coalesce, rebuild, repeat until empty or out
 * of time budget, then checks whether the initial backfill has finished
 * draining. `conn` defaults to the shared db handle; tests pass their own so
 * this can run against a throwaway database without touching pg-boss.
 */
export async function runRefreshTick(
	options: { maxMarks?: number; timeBudgetMs?: number; source?: string } = {},
	conn: DbConnection = db,
): Promise<RefreshTickResult> {
	const maxMarks = options.maxMarks ?? DEFAULT_MAX_MARKS;
	const start = Date.now();
	const deadline = start + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);

	let ranges = 0;
	let failed = 0;
	let marksClaimed = 0;

	while (Date.now() < deadline) {
		const marks = await claimDirty(conn, maxMarks);
		if (marks.length === 0) break;
		marksClaimed += marks.length;
		const batch = await processClaimedBatch(conn, marks, deadline);
		ranges += batch.ranges;
		failed += batch.failed;
		// A failed range's marks were just restored and sit at the front of the
		// queue, so claiming again would retry them in a tight loop for the rest
		// of the budget; the next tick retries them once instead.
		if (batch.timedOut || batch.failed > 0) break;
	}

	await finishBackfillIfDrained(conn);

	const elapsedMs = Date.now() - start;
	console.log(
		`[refresh-rollups] source=${options.source ?? "unknown"} marksClaimed=${marksClaimed} ranges=${ranges} failed=${failed} elapsedMs=${elapsedMs}`,
	);
	return { ranges, failed, marksClaimed };
}

export async function refreshRollupsJob(jobs: Job<RefreshRollupsData>[]): Promise<void> {
	for (const job of jobs) {
		await runRefreshTick({ source: job.data?.source ?? "unknown" });
	}
}
