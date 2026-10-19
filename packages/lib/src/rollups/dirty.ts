import { desc, type SQL, sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { rollupDirty } from "../db/schema";
import { bucketSql, bucketStart } from "./bucket";
import { chunked } from "./chunk";
import { BUCKET_MS } from "./constants";
import { type RebuildStats, rebuildRange, tryLockBrandRollups } from "./rebuild";

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

/** One mark per (brand, bucket), in a fixed lock order so two writers marking overlapping buckets can't deadlock. */
function uniqueMarks(writes: Iterable<{ brandId: string; at: Date }>): DirtyMark[] {
	const byKey = new Map<string, DirtyMark>();
	for (const { brandId, at } of writes) {
		const bucket = bucketStart(at);
		byKey.set(`${brandId}\u0000${bucket.getTime()}`, { brandId, bucket });
	}
	return Array.from(byKey.values()).sort(
		(a, b) => (a.brandId < b.brandId ? -1 : Number(a.brandId > b.brandId)) || a.bucket.getTime() - b.bucket.getTime(),
	);
}

/**
 * A conflicting mark is updated rather than skipped so the writer holds its row
 * lock until commit: a refresh skips a mark a writer holds, and a writer waits on
 * one a refresh has taken, landing a fresh mark once it commits. Either way the
 * write's bucket is rebuilt after the write is visible.
 */
export function markDirty(conn: DbConnection, brandId: string, buckets: Iterable<Date>): Promise<number> {
	return markWritesDirty(
		conn,
		Array.from(buckets, (at) => ({ brandId, at })),
	);
}

/** `markDirty` for writes across brands, in one statement per chunk. */
export async function markWritesDirty(
	conn: DbConnection,
	writes: Iterable<{ brandId: string; at: Date }>,
): Promise<number> {
	let marked = 0;
	for (const chunk of chunked(uniqueMarks(writes))) {
		const result = await conn
			.insert(rollupDirty)
			.values(chunk)
			.onConflictDoUpdate({
				target: [rollupDirty.brandId, rollupDirty.bucket],
				set: { firstMarkedAt: sql`${rollupDirty.firstMarkedAt}` },
			});
		marked += result.rowCount ?? 0;
	}
	return marked;
}

// For writes that have already committed, which a rebuild is sure to see, so a
// conflicting mark needs no lock.
async function markRunsWhere(conn: DbConnection, where: SQL): Promise<number> {
	const result = await conn.execute(sql`
		INSERT INTO ${rollupDirty} (brand_id, bucket)
		SELECT DISTINCT brand_id, ${bucketSql(sql`created_at`)}
		FROM prompt_runs
		WHERE ${where}
		ON CONFLICT (brand_id, bucket) DO NOTHING
	`);
	return result.rowCount ?? 0;
}

/** Marks every bucket with runs created since `since`, or with any runs at all. */
export function markRunsDirty(conn: DbConnection, since: Date | null): Promise<number> {
	return markRunsWhere(conn, since ? sql`created_at >= ${since}` : sql`TRUE`);
}

/**
 * Marks every bucket the prompts have runs in, inside the transaction that edits
 * them (their text decides which web queries count as fan-out), with the same
 * hold-until-commit as `markDirty`.
 */
export async function markPromptRunsDirty(conn: DbConnection, brandId: string, promptIds: string[]): Promise<number> {
	if (promptIds.length === 0) return 0;
	const rows = await conn.execute<{ bucket: Date | string }>(sql`
		SELECT DISTINCT ${bucketSql(sql`created_at`)} AS bucket
		FROM prompt_runs
		WHERE brand_id = ${brandId} AND prompt_id IN (${sql.join(
			promptIds.map((id) => sql`${id}::uuid`),
			sql`, `,
		)})
	`);
	return markDirty(
		conn,
		brandId,
		rows.rows.map((row) => new Date(row.bucket)),
	);
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
 * a writer still holds are skipped rather than waited on. Returns null when
 * there was nothing left to take or the brand is busy.
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
		// A brand another refresh or a prompt delete is rewriting waits for the next
		// tick. Not waiting also means a refresh never holds marks while blocked, so
		// it can't close a lock cycle with a delete and that prompt's run writer.
		if (!(await tryLockBrandRollups(tx, range.brandId))) return null;
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
		let refreshed = false;
		for (const range of coalesceMarks(marks)) refreshed = (await refreshRange(conn, range)) !== null || refreshed;
		if (!refreshed) return;
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
		// A rebuild costs the same handful of statements however many buckets it
		// spans, and an unmarked bucket in between rebuilds to the rows it already
		// has, so gaps are swallowed up to the cap rather than split on.
		const joinable = current !== null && (end.getTime() - current.from.getTime()) / BUCKET_MS <= maxBuckets;
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

/** A week: a backfill of a busy brand rebuilds in about a second per range. */
const MAX_RANGE_BUCKETS = (7 * 24 * 60 * 60 * 1000) / BUCKET_MS;

/**
 * Folds marks into as few rebuild ranges as possible: each range pays a fixed
 * number of round trips, so a backfill is a few ranges per brand, not thousands.
 */
export function coalesceMarks(marks: DirtyMark[], maxBuckets = MAX_RANGE_BUCKETS): RebuildRange[] {
	const ranges: RebuildRange[] = [];
	for (const [brandId, group] of groupMarksByBrand(marks)) {
		ranges.push(...rangesForBrand(brandId, group, maxBuckets));
	}
	return ranges.sort(
		(a, b) => (a.brandId < b.brandId ? -1 : Number(a.brandId > b.brandId)) || a.from.getTime() - b.from.getTime(),
	);
}
