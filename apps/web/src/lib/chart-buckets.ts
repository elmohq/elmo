import { type ChartDataPoint, formatShortDate } from "@/lib/chart-utils";

/** The span of days one chart point stands for; a single day when `start` equals `end`. */
export interface DateBucket {
	start: string;
	end: string;
}

const LONGEST_DAILY_RANGE = 35;
const LONGEST_WEEKLY_RANGE = 548;

/** Daily points crowd into noise past a month, and weekly ones past a year and a half. */
export function bucketDaysForRange(dayCount: number): 1 | 7 | 30 {
	if (dayCount <= LONGEST_DAILY_RANGE) return 1;
	return dayCount <= LONGEST_WEEKLY_RANGE ? 7 : 30;
}

/**
 * Splits `dates` into the half-open index ranges each chart point covers. Buckets
 * are counted back from the last day so the newest point is always a full one,
 * rather than a partial calendar week that jumps around as it fills in. Leftover
 * days at the start join the oldest bucket when they're too few to stand alone.
 */
export function bucketDateIndexes(dates: string[]): { from: number; to: number }[] {
	const size = bucketDaysForRange(dates.length);
	const ranges: { from: number; to: number }[] = [];
	for (let to = dates.length; to > 0; to -= size) ranges.unshift({ from: Math.max(0, to - size), to });
	if (ranges.length > 1 && ranges[0].to - ranges[0].from < size / 2) {
		ranges[1].from = 0;
		ranges.shift();
	}
	return ranges;
}

export function bucketDates(dates: string[]): DateBucket[] {
	return bucketDateIndexes(dates).map(({ from, to }) => ({ start: dates[from], end: dates[to - 1] }));
}

export function formatBucket(bucket: DateBucket): string {
	return bucket.start === bucket.end
		? formatShortDate(bucket.end)
		: `${formatShortDate(bucket.start)} – ${formatShortDate(bucket.end)}`;
}

/** Where a bucketed point keeps its first day; its `date` is the last. */
export const BUCKET_START_KEY = "_bucketStart";
/** A day's run count, so a bucket weighs its days by how much they observed. */
export const RUNS_KEY = "_runs";

export function bucketOfPoint(point: ChartDataPoint): DateBucket {
	const start = point[BUCKET_START_KEY];
	return { start: typeof start === "string" ? start : point.date, end: point.date };
}

function weightedMean(days: ChartDataPoint[], key: string): number | null {
	let weighted = 0;
	let weight = 0;
	for (const day of days) {
		const value = day[key];
		if (typeof value !== "number") continue;
		const runs = day[RUNS_KEY];
		const dayWeight = typeof runs === "number" && runs > 0 ? runs : 1;
		weighted += value * dayWeight;
		weight += dayWeight;
	}
	return weight > 0 ? Math.round(weighted / weight) : null;
}

/**
 * Collapses consecutive daily percentage points into the buckets their range calls
 * for. Each bucket is the run-weighted mean of its observed days, which is the
 * percentage over all of the bucket's runs; days without a run count weigh the same.
 */
export function bucketChartData(points: ChartDataPoint[], keys: string[]): ChartDataPoint[] {
	if (bucketDaysForRange(points.length) === 1) return points;
	return bucketDateIndexes(points.map((point) => point.date)).map(({ from, to }) => {
		const days = points.slice(from, to);
		const bucketed: ChartDataPoint = { date: days[days.length - 1].date, [BUCKET_START_KEY]: days[0].date };
		for (const key of keys) bucketed[key] = weightedMean(days, key);
		return bucketed;
	});
}
