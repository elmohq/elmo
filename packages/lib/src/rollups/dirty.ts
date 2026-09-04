import { sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { rollupDirty } from "../db/schema";
import { bucketSql, bucketStart } from "./bucket";
import { BUCKET_MS, type DirtyReason } from "./constants";
import { inTransaction } from "./transaction";

export interface DirtyMark {
	brandId: string;
	bucket: Date;
	reason: DirtyReason;
}

/** One rebuild covering a contiguous span of one brand's buckets. */
export interface RebuildRange {
	brandId: string;
	from: Date;
	toExclusive: Date;
	marks: DirtyMark[];
}

function uniqueBuckets(buckets: Iterable<Date>): Date[] {
	const byTime = new Map<number, Date>();
	for (const bucket of buckets) {
		const start = bucketStart(bucket);
		byTime.set(start.getTime(), start);
	}
	return Array.from(byTime.values());
}

/** Records buckets as needing a rebuild. Safe to call repeatedly; marks collapse. */
export async function markDirty(
	conn: DbConnection,
	brandId: string,
	buckets: Iterable<Date>,
	reason: DirtyReason,
): Promise<number> {
	const values = uniqueBuckets(buckets).map((bucket) => ({ brandId, bucket, reason }));
	if (values.length === 0) return 0;
	const result = await conn
		.insert(rollupDirty)
		.values(values)
		.onConflictDoNothing({ target: [rollupDirty.brandId, rollupDirty.bucket] });
	return result.rowCount ?? 0;
}

export function markDirtyForTimestamps(
	conn: DbConnection,
	brandId: string,
	timestamps: Iterable<Date>,
	reason: DirtyReason,
): Promise<number> {
	return markDirty(conn, brandId, timestamps, reason);
}

/** Marks every bucket in `[from, toExclusive)` that has at least one run. */
export async function markBrandRangeDirty(
	conn: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
	reason: DirtyReason,
): Promise<number> {
	const result = await conn.execute(sql`
		INSERT INTO ${rollupDirty} (brand_id, bucket, reason)
		SELECT DISTINCT brand_id, ${bucketSql(sql`created_at`)}, ${reason}::text
		FROM prompt_runs
		WHERE brand_id = ${brandId} AND created_at >= ${from} AND created_at < ${toExclusive}
		ON CONFLICT (brand_id, bucket) DO NOTHING
	`);
	return result.rowCount ?? 0;
}

/** Marks every bucket of every brand that has a run. */
export async function markAllDirty(conn: DbConnection, reason: DirtyReason): Promise<number> {
	const result = await conn.execute(sql`
		INSERT INTO ${rollupDirty} (brand_id, bucket, reason)
		SELECT DISTINCT brand_id, ${bucketSql(sql`created_at`)}, ${reason}::text
		FROM prompt_runs
		ON CONFLICT (brand_id, bucket) DO NOTHING
	`);
	return result.rowCount ?? 0;
}

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));

/**
 * Takes up to `limit` marks off the queue, newest bucket first, in its own short
 * transaction. Claiming before reading raw rows is what makes a rebuild
 * race-free: a writer that commits afterwards leaves a fresh mark behind.
 */
export function claimDirty(conn: DbConnection, limit: number): Promise<DirtyMark[]> {
	return inTransaction(conn, async (tx) => {
		const result = await tx.execute(sql`
			DELETE FROM ${rollupDirty}
			WHERE (brand_id, bucket) IN (
				SELECT brand_id, bucket FROM ${rollupDirty}
				ORDER BY bucket DESC
				LIMIT ${limit}
				FOR UPDATE SKIP LOCKED
			)
			RETURNING brand_id, bucket, reason
		`);
		// RETURNING follows the delete's scan order, so recency is restored here.
		return (result.rows as { brand_id: string; bucket: unknown; reason: DirtyReason }[])
			.map((row) => ({ brandId: row.brand_id, bucket: toDate(row.bucket), reason: row.reason }))
			.sort((a, b) => b.bucket.getTime() - a.bucket.getTime());
	});
}

/** Puts claimed marks back after a failed rebuild. */
export async function restoreDirty(conn: DbConnection, marks: DirtyMark[]): Promise<number> {
	if (marks.length === 0) return 0;
	const byKey = new Map(marks.map((mark) => [`${mark.brandId} ${mark.bucket.getTime()}`, mark]));
	const result = await conn
		.insert(rollupDirty)
		.values(Array.from(byKey.values(), ({ brandId, bucket, reason }) => ({ brandId, bucket, reason })))
		.onConflictDoNothing({ target: [rollupDirty.brandId, rollupDirty.bucket] });
	return result.rowCount ?? 0;
}

function groupMarksByBrand(marks: DirtyMark[]): Map<string, DirtyMark[]> {
	const byBrand = new Map<string, DirtyMark[]>();
	for (const mark of marks) {
		const group = byBrand.get(mark.brandId);
		if (group) group.push(mark);
		else byBrand.set(mark.brandId, [mark]);
	}
	for (const group of byBrand.values()) {
		group.sort((a, b) => a.bucket.getTime() - b.bucket.getTime());
	}
	return byBrand;
}

function rangesForBrand(brandId: string, sorted: DirtyMark[], maxBuckets: number): RebuildRange[] {
	const ranges: RebuildRange[] = [];
	let current: RebuildRange | null = null;
	for (const mark of sorted) {
		const end = new Date(mark.bucket.getTime() + BUCKET_MS);
		// A single missing bucket inside a run is cheaper to swallow than to skip:
		// it costs one empty delete and saves a whole extra rebuild transaction.
		const joinable =
			current !== null &&
			mark.bucket.getTime() - current.toExclusive.getTime() <= BUCKET_MS &&
			(end.getTime() - current.from.getTime()) / BUCKET_MS <= maxBuckets;
		if (current && joinable) {
			current.toExclusive = end;
			current.marks.push(mark);
			continue;
		}
		current = { brandId, from: mark.bucket, toExclusive: end, marks: [mark] };
		ranges.push(current);
	}
	return ranges;
}

/**
 * Folds marks into as few rebuild ranges as possible, so a brand's busy hour is
 * one transaction rather than dozens.
 */
export function coalesceMarks(marks: DirtyMark[], maxBuckets = 48): RebuildRange[] {
	const ranges: RebuildRange[] = [];
	for (const [brandId, group] of groupMarksByBrand(marks)) {
		ranges.push(...rangesForBrand(brandId, group, maxBuckets));
	}
	return ranges.sort(
		(a, b) => (a.brandId < b.brandId ? -1 : Number(a.brandId > b.brandId)) || a.from.getTime() - b.from.getTime(),
	);
}
