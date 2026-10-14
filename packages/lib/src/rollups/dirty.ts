import { desc, type SQL, sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { rollupDirty } from "../db/schema";
import { bucketSql, bucketStart } from "./bucket";
import { BUCKET_MS } from "./constants";
import { type RebuildStats, rebuildRange } from "./rebuild";

export interface DirtyMark {
	brandId: string;
	bucket: Date;
}

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
	// A fixed lock order, so two writers marking overlapping buckets can't deadlock.
	return Array.from(byTime.values()).sort((a, b) => a.getTime() - b.getTime());
}

/**
 * A conflicting mark is updated rather than skipped so the writer holds its row
 * lock until commit: a refresh skips a mark a writer holds, and a writer waits on
 * one a refresh has taken, landing a fresh mark once it commits. Either way the
 * write's bucket is rebuilt after the write is visible.
 */
export async function markDirty(conn: DbConnection, brandId: string, buckets: Iterable<Date>): Promise<number> {
	const values = uniqueBuckets(buckets).map((bucket) => ({ brandId, bucket }));
	if (values.length === 0) return 0;
	const result = await conn
		.insert(rollupDirty)
		.values(values)
		.onConflictDoUpdate({
			target: [rollupDirty.brandId, rollupDirty.bucket],
			set: { firstMarkedAt: sql`${rollupDirty.firstMarkedAt}` },
		});
	return result.rowCount ?? 0;
}

/** For writes that have already committed, which a rebuild is sure to see. */
async function markRunsDirty(conn: DbConnection, where: SQL): Promise<number> {
	const result = await conn.execute(sql`
		INSERT INTO ${rollupDirty} (brand_id, bucket)
		SELECT DISTINCT brand_id, ${bucketSql(sql`created_at`)}
		FROM prompt_runs
		WHERE ${where}
		ON CONFLICT (brand_id, bucket) DO NOTHING
	`);
	return result.rowCount ?? 0;
}

export function markAllDirty(conn: DbConnection): Promise<number> {
	return markRunsDirty(conn, sql`TRUE`);
}

export function markRunsSinceDirty(conn: DbConnection, since: Date): Promise<number> {
	return markRunsDirty(conn, sql`created_at >= ${since}`);
}

const markKey = (mark: Pick<DirtyMark, "brandId" | "bucket">): SQL =>
	sql`(${mark.brandId}::text, ${mark.bucket}::timestamptz)`;

/**
 * Up to `limit` marks, newest bucket first, without taking them: ranges are
 * taken one at a time by `refreshRange`. `skip` holds marks this tick has
 * already tried, so a range that keeps failing doesn't crowd out the rest.
 */
export async function pendingMarks(conn: DbConnection, limit: number, skip: DirtyMark[] = []): Promise<DirtyMark[]> {
	const notSkipped = skip.length
		? sql`(${rollupDirty.brandId}, ${rollupDirty.bucket}) NOT IN (${sql.join(skip.map(markKey), sql`, `)})`
		: undefined;
	const marks = await conn
		.select({ brandId: rollupDirty.brandId, bucket: rollupDirty.bucket })
		.from(rollupDirty)
		.where(notSkipped)
		.orderBy(desc(rollupDirty.bucket))
		.limit(limit);
	return marks as DirtyMark[];
}

/**
 * Deletes a range's marks and rebuilds what they span in one transaction, so
 * the marks go exactly when the rebuild commits and survive if it fails. Marks
 * another refresh holds are skipped rather than waited on. Returns null when
 * there was nothing left to take.
 *
 * Every rebuild statement runs after the delete under READ COMMITTED, so it
 * sees every write that committed before the delete; a write that commits later
 * re-marks its bucket (see `markDirty`).
 */
export function refreshRange(
	conn: DbConnection,
	range: Pick<RebuildRange, "brandId" | "from" | "toExclusive">,
): Promise<{ marks: DirtyMark[]; stats: RebuildStats } | null> {
	return conn.transaction(async (tx) => {
		const marks = (await tx
			.delete(rollupDirty)
			.where(sql`(${rollupDirty.brandId}, ${rollupDirty.bucket}) IN (
				SELECT brand_id, bucket FROM ${rollupDirty}
				WHERE brand_id = ${range.brandId} AND bucket >= ${range.from} AND bucket < ${range.toExclusive}
				FOR UPDATE SKIP LOCKED
			)`)
			.returning({ brandId: rollupDirty.brandId, bucket: rollupDirty.bucket })) as DirtyMark[];
		if (marks.length === 0) return null;
		// One rebuild from the first taken bucket to the last: any unmarked bucket in
		// between is rebuilt to the same rows, and a single rebuild takes its page
		// locks in one sorted pass, so concurrent refreshes can't deadlock on them.
		const times = marks.map((mark) => mark.bucket.getTime());
		const from = new Date(Math.min(...times));
		const toExclusive = new Date(Math.max(...times) + BUCKET_MS);
		return { marks, stats: await rebuildRange(tx, range.brandId, from, toExclusive) };
	});
}

/** Rebuilds every marked bucket now, for seeds and scripts; the worker drains marks on a schedule instead. */
export async function refreshAllMarked(conn: DbConnection): Promise<void> {
	for (;;) {
		const marks = await pendingMarks(conn, 500);
		if (marks.length === 0) return;
		for (const range of coalesceMarks(marks)) await refreshRange(conn, range);
	}
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
