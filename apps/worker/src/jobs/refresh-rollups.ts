import * as Sentry from "@sentry/node";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import {
	claimDirty,
	coalesceMarks,
	completeDirty,
	type DirtyClaim,
	finishBackfillIfDrained,
	type RebuildRange,
	rebuildRange,
	releaseDirty,
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

async function rebuildClaim(
	conn: DbConnection,
	claim: DirtyClaim,
	deadline: number,
): Promise<{ ranges: number; failed: number; timedOut: boolean }> {
	const ranges = coalesceMarks(claim.marks);
	let rebuilt = 0;
	let failed = 0;
	for (const [i, range] of ranges.entries()) {
		if (Date.now() > deadline) {
			await releaseDirty(conn, claim.claimId, ranges.slice(i));
			return { ranges: rebuilt, failed, timedOut: true };
		}
		try {
			await rebuildRange(conn, range.brandId, range.from, range.toExclusive);
			await completeDirty(conn, claim.claimId, range);
			rebuilt++;
		} catch (error) {
			// The range keeps its lease, so it's retried once the lease lapses rather than on every claim.
			failed++;
			reportRebuildFailure(error, range);
		}
	}
	return { ranges: rebuilt, failed, timedOut: false };
}

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
		const claim = await claimDirty(conn, maxMarks);
		if (claim.marks.length === 0) break;
		marksClaimed += claim.marks.length;
		const batch = await rebuildClaim(conn, claim, deadline);
		ranges += batch.ranges;
		failed += batch.failed;
		if (batch.timedOut) break;
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
