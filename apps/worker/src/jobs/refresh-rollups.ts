import * as Sentry from "@sentry/node";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { coalesceMarks, type DirtyMark, pendingMarks, type RebuildRange, refreshRange } from "@workspace/lib/rollups";
import type { Job } from "pg-boss";

export interface RefreshRollupsData {
	source?: string;
}

const DEFAULT_MAX_MARKS = 200;
const DEFAULT_TIME_BUDGET_MS = 50_000;

export interface RefreshTickResult {
	ranges: number;
	failed: number;
	marksTaken: number;
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

async function refreshBatch(
	conn: DbConnection,
	batch: DirtyMark[],
	deadline: number,
	skip: DirtyMark[],
): Promise<RefreshTickResult> {
	const result: RefreshTickResult = { ranges: 0, failed: 0, marksTaken: 0 };
	for (const range of coalesceMarks(batch)) {
		if (Date.now() >= deadline) break;
		try {
			const refreshed = await refreshRange(conn, range);
			if (!refreshed) {
				skip.push(...range.marks);
				continue;
			}
			result.ranges++;
			result.marksTaken += refreshed.marks.length;
		} catch (error) {
			result.failed++;
			skip.push(...range.marks);
			reportRebuildFailure(error, range);
		}
	}
	return result;
}

/**
 * Each range commits on its own, so a failing one keeps its marks for the next
 * tick without holding back the rest. Ranges this tick has tried, or that
 * another worker had already taken, are skipped until the tick ends.
 */
export async function runRefreshTick(
	options: { maxMarks?: number; timeBudgetMs?: number; source?: string } = {},
	conn: DbConnection = db,
): Promise<RefreshTickResult> {
	const maxMarks = options.maxMarks ?? DEFAULT_MAX_MARKS;
	const start = Date.now();
	const deadline = start + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
	const totals: RefreshTickResult = { ranges: 0, failed: 0, marksTaken: 0 };
	const skip: DirtyMark[] = [];

	while (Date.now() < deadline) {
		const batch = await pendingMarks(conn, maxMarks, skip);
		if (batch.length === 0) break;
		const result = await refreshBatch(conn, batch, deadline, skip);
		totals.ranges += result.ranges;
		totals.failed += result.failed;
		totals.marksTaken += result.marksTaken;
	}

	const elapsedMs = Date.now() - start;
	console.log(
		`[refresh-rollups] source=${options.source ?? "unknown"} marksTaken=${totals.marksTaken} ranges=${totals.ranges} failed=${totals.failed} elapsedMs=${elapsedMs}`,
	);
	return totals;
}

export async function refreshRollupsJob(jobs: Job<RefreshRollupsData>[]): Promise<void> {
	for (const job of jobs) {
		await runRefreshTick({ source: job.data?.source ?? "unknown" });
	}
}
