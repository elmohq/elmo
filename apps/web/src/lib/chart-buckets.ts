import type { ChartDataPoint } from "@/lib/chart-utils";

const LONGEST_DAILY_RANGE = 35;
const LONGEST_WEEKLY_RANGE = 548;

/** Daily points crowd into noise past a month, and weekly ones past a year and a half. */
export function bucketDaysForRange(dayCount: number): 1 | 7 | 30 {
	if (dayCount <= LONGEST_DAILY_RANGE) return 1;
	return dayCount <= LONGEST_WEEKLY_RANGE ? 7 : 30;
}

/**
 * Splits a range of days into the half-open index ranges each chart point covers. Buckets
 * are counted back from the last day so the newest point is always a full one,
 * rather than a partial calendar week that jumps around as it fills in. Leftover
 * days at the start join the oldest bucket when they're too few to stand alone.
 */
export function bucketDayIndexes(dayCount: number): { from: number; to: number }[] {
	const size = bucketDaysForRange(dayCount);
	const ranges: { from: number; to: number }[] = [];
	for (let to = dayCount; to > 0; to -= size) ranges.unshift({ from: Math.max(0, to - size), to });
	if (ranges.length > 1 && ranges[0].to - ranges[0].from < size / 2) {
		ranges[1].from = 0;
		ranges.shift();
	}
	return ranges;
}

/**
 * The day each bucket's point is drawn on, when the points share an axis with
 * every day of the range: spread evenly from the first day to the last so the
 * line spans the chart, and never outside the bucket it stands for.
 */
export function bucketAnchorIndexes(dayCount: number): number[] {
	const ranges = bucketDayIndexes(dayCount);
	return ranges.map(({ from, to }, i) => {
		if (ranges.length === 1) return to - 1;
		const even = Math.round((i * (dayCount - 1)) / (ranges.length - 1));
		return Math.min(to - 1, Math.max(from, even));
	});
}

/** A day's run count, so a bucket weighs its days by how much they observed. */
export const RUNS_KEY = "_runs";

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
	return bucketDayIndexes(points.length).map(({ from, to }) => {
		const days = points.slice(from, to);
		const bucketed: ChartDataPoint = { date: days[days.length - 1].date };
		for (const key of keys) bucketed[key] = weightedMean(days, key);
		return bucketed;
	});
}
