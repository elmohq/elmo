import * as Sentry from "@sentry/node";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { promptRuns, rollupPromptRuns } from "@workspace/lib/db/schema";
import {
	type BucketComparison,
	bucketEnd,
	bucketStart,
	compareBucket,
	markBrandRangeDirty,
	markDirty,
	setPipelineState,
} from "@workspace/lib/rollups";
import { gte, lt, sql } from "drizzle-orm";
import type { Job } from "pg-boss";

export interface ReconcileRollupsData {
	source?: string;
}

const TRAILING_WINDOW_MS = 48 * 60 * 60 * 1000;
const SAMPLE_SIZE = 20;

export function isMismatch(comparison: BucketComparison): boolean {
	return (
		comparison.runs[0] !== comparison.runs[1] ||
		comparison.brandMentioned[0] !== comparison.brandMentioned[1] ||
		comparison.citations[0] !== comparison.citations[1]
	);
}

function reportDrift(brandId: string, bucket: Date, comparison: BucketComparison): void {
	console.warn(`[reconcile-rollups] drift detected for brand ${brandId} at ${bucket.toISOString()}`, comparison);
	Sentry.withScope((scope) => {
		scope.setLevel("warning");
		scope.setFingerprint(["rollup-drift", brandId]);
		Sentry.captureMessage(
			`Rollup drift for brand ${brandId} at ${bucket.toISOString()}: ` +
				`runs ${comparison.runs[0]}/${comparison.runs[1]}, ` +
				`brandMentioned ${comparison.brandMentioned[0]}/${comparison.brandMentioned[1]}, ` +
				`citations ${comparison.citations[0]}/${comparison.citations[1]}`,
			"warning",
		);
	});
}

async function brandsWithRecentRuns(conn: DbConnection, since: Date): Promise<string[]> {
	const rows = await conn
		.selectDistinct({ brandId: promptRuns.brandId })
		.from(promptRuns)
		.where(gte(promptRuns.createdAt, since));
	return rows.map((row) => row.brandId);
}

// GROUP BY rather than SELECT DISTINCT: Postgres rejects `ORDER BY random()`
// on a DISTINCT unless the order expression is in the select list.
async function sampleOldBuckets(
	conn: DbConnection,
	before: Date,
	limit: number,
): Promise<{ brandId: string; bucket: Date }[]> {
	const rows = await conn
		.select({ brandId: rollupPromptRuns.brandId, bucket: rollupPromptRuns.bucket })
		.from(rollupPromptRuns)
		.where(lt(rollupPromptRuns.bucket, before))
		.groupBy(rollupPromptRuns.brandId, rollupPromptRuns.bucket)
		.orderBy(sql`random()`)
		.limit(limit);
	return rows;
}

async function markTrailingWindowDirty(
	conn: DbConnection,
	brandIds: string[],
	from: Date,
	toExclusive: Date,
): Promise<number> {
	let marked = 0;
	for (const brandId of brandIds) {
		marked += await markBrandRangeDirty(conn, brandId, from, toExclusive, "reconcile");
	}
	return marked;
}

async function checkSample(
	conn: DbConnection,
	sample: { brandId: string; bucket: Date }[],
): Promise<{ checked: number; mismatches: number }> {
	let mismatches = 0;
	for (const { brandId, bucket } of sample) {
		const comparison = await compareBucket(conn, brandId, bucket, bucketEnd(bucket));
		if (!isMismatch(comparison)) continue;
		mismatches++;
		reportDrift(brandId, bucket, comparison);
		await markDirty(conn, brandId, [bucket], "reconcile");
	}
	return { checked: sample.length, mismatches };
}

// The trailing window is remarked dirty unconditionally as cheap insurance
// against a missed invalidation near the write path; older drift is caught by sampling.
export async function runReconcileTick(source: string, conn: DbConnection = db): Promise<void> {
	const now = new Date();
	const trailingFrom = bucketStart(new Date(now.getTime() - TRAILING_WINDOW_MS));
	const trailingTo = bucketEnd(now);

	const brandIds = await brandsWithRecentRuns(conn, trailingFrom);
	const trailingMarks = await markTrailingWindowDirty(conn, brandIds, trailingFrom, trailingTo);

	const sample = await sampleOldBuckets(conn, trailingFrom, SAMPLE_SIZE);
	const { checked, mismatches } = await checkSample(conn, sample);

	await setPipelineState(conn, { lastReconcileAt: now });

	console.log(
		`[reconcile-rollups] source=${source} brands=${brandIds.length} trailingMarks=${trailingMarks} sampled=${checked} mismatches=${mismatches}`,
	);
}

export async function reconcileRollupsJob(jobs: Job<ReconcileRollupsData>[]): Promise<void> {
	for (const job of jobs) {
		await runReconcileTick(job.data?.source ?? "unknown");
	}
}
