import { randomUUID } from "node:crypto";
import { type SQL, sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { rollupDirty } from "../db/schema";
import { bucketSql, bucketStart } from "./bucket";
import { BUCKET_MS, CLAIM_LEASE_MINUTES, type DirtyReason } from "./constants";

const CLAIM_LEASE = sql.raw(`interval '${CLAIM_LEASE_MINUTES} minutes'`);

export interface DirtyMark {
	brandId: string;
	bucket: Date;
	reason: DirtyReason;
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
	return Array.from(byTime.values());
}

const RELEASE_CLAIM = sql`DO UPDATE SET claim_id = NULL, claimed_until = NULL`;

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
		.onConflictDoUpdate({
			target: [rollupDirty.brandId, rollupDirty.bucket],
			set: { claimId: null, claimedUntil: null },
		});
	return result.rowCount ?? 0;
}

/**
 * Re-marking a claimed bucket clears its claim, so a write that lands while the
 * bucket is being rebuilt keeps the mark alive for another rebuild.
 */
async function markRunsDirty(conn: DbConnection, reason: DirtyReason, where: SQL): Promise<number> {
	const result = await conn.execute(sql`
		INSERT INTO ${rollupDirty} (brand_id, bucket, reason)
		SELECT DISTINCT brand_id, ${bucketSql(sql`created_at`)}, ${reason}::text
		FROM prompt_runs
		WHERE ${where}
		ON CONFLICT (brand_id, bucket) ${RELEASE_CLAIM}
	`);
	return result.rowCount ?? 0;
}

export function markBrandRangeDirty(
	conn: DbConnection,
	brandId: string,
	from: Date,
	toExclusive: Date,
	reason: DirtyReason,
): Promise<number> {
	return markRunsDirty(
		conn,
		reason,
		sql`brand_id = ${brandId} AND created_at >= ${from} AND created_at < ${toExclusive}`,
	);
}

export function markPromptDirty(conn: DbConnection, promptId: string, reason: DirtyReason): Promise<number> {
	return markRunsDirty(conn, reason, sql`prompt_id = ${promptId}`);
}

export function markAllDirty(conn: DbConnection, reason: DirtyReason): Promise<number> {
	return markRunsDirty(conn, reason, sql`TRUE`);
}

export interface DirtyClaim {
	claimId: string;
	marks: DirtyMark[];
}

/**
 * Leases up to `limit` unclaimed marks, newest bucket first. Marks stay in the
 * table until their range is rebuilt, so a crashed or killed tick loses nothing:
 * the lease lapses and another tick picks them up. Claiming before reading raw
 * rows keeps rebuilds race-free, because a writer that commits afterwards clears
 * the claim and the completed rebuild then leaves the mark in place.
 */
export async function claimDirty(conn: DbConnection, limit: number): Promise<DirtyClaim> {
	const claimId = randomUUID();
	const marks = await conn
		.update(rollupDirty)
		.set({ claimId, claimedUntil: sql`now() + ${CLAIM_LEASE}` })
		.where(sql`(${rollupDirty.brandId}, ${rollupDirty.bucket}) IN (
			SELECT brand_id, bucket FROM ${rollupDirty}
			WHERE claimed_until IS NULL OR claimed_until < now()
			ORDER BY bucket DESC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		)`)
		.returning({ brandId: rollupDirty.brandId, bucket: rollupDirty.bucket, reason: rollupDirty.reason });
	// RETURNING doesn't follow the subquery's order.
	marks.sort((a, b) => b.bucket.getTime() - a.bucket.getTime());
	return { claimId, marks: marks as DirtyMark[] };
}

const inRange = (claimId: string, range: Pick<RebuildRange, "brandId" | "from" | "toExclusive">): SQL =>
	sql`${rollupDirty.claimId} = ${claimId} AND ${rollupDirty.brandId} = ${range.brandId}
		AND ${rollupDirty.bucket} >= ${range.from} AND ${rollupDirty.bucket} < ${range.toExclusive}`;

/** Drops a rebuilt range's marks, except any re-marked since the claim. */
export async function completeDirty(conn: DbConnection, claimId: string, range: RebuildRange): Promise<void> {
	await conn.delete(rollupDirty).where(inRange(claimId, range));
}

/** Hands unstarted ranges back without waiting for the lease to lapse. */
export async function releaseDirty(conn: DbConnection, claimId: string, ranges: RebuildRange[]): Promise<void> {
	for (const range of ranges) {
		await conn.update(rollupDirty).set({ claimId: null, claimedUntil: null }).where(inRange(claimId, range));
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
