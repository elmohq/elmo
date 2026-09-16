import { type SQL, sql } from "drizzle-orm";
import { BUCKET_MINUTES, BUCKET_MS } from "./constants";

/**
 * `date_bin`'s origin. Any instant on a bucket boundary works; a fixed epoch
 * keeps SQL and TypeScript bucketing identical, since `BUCKET_MS` divides the
 * distance from the Unix epoch to this one.
 */
const BUCKET_ORIGIN = "2000-01-01T00:00:00Z";

export function bucketStart(date: Date): Date {
	return new Date(Math.floor(date.getTime() / BUCKET_MS) * BUCKET_MS);
}

export function bucketEnd(date: Date): Date {
	return new Date(bucketStart(date).getTime() + BUCKET_MS);
}

const BUCKET_STRIDE_SQL = sql.raw(`interval '${BUCKET_MINUTES} minutes'`);
const BUCKET_ORIGIN_SQL = sql.raw(`timestamptz '${BUCKET_ORIGIN}'`);

/** The bucket a timestamp column falls in, as Postgres computes it. */
export function bucketSql(column: SQL): SQL {
	return sql`date_bin(${BUCKET_STRIDE_SQL}, ${column}, ${BUCKET_ORIGIN_SQL})`;
}

export function isBucketAligned(date: Date): boolean {
	return date.getTime() % BUCKET_MS === 0;
}

export function assertBucketAligned(date: Date): void {
	if (!isBucketAligned(date)) {
		throw new Error(`${date.toISOString()} is not aligned to a ${BUCKET_MINUTES}-minute bucket boundary`);
	}
}

/** Every bucket start in `[from, toExclusive)`; empty when the range is empty. */
export function bucketsBetween(from: Date, toExclusive: Date): Date[] {
	const buckets: Date[] = [];
	const end = toExclusive.getTime();
	for (let t = bucketStart(from).getTime(); t < end; t += BUCKET_MS) {
		buckets.push(new Date(t));
	}
	return buckets;
}
