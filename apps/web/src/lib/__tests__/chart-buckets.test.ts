import { describe, expect, it } from "vitest";
import { bucketAnchorIndexes, bucketChartData, bucketDayIndexes, RUNS_KEY } from "@/lib/chart-buckets";
import { generateDateRange } from "@/lib/chart-utils";

const days = (count: number) => {
	const end = new Date("2026-06-30T00:00:00Z");
	const start = new Date(end);
	start.setUTCDate(start.getUTCDate() - (count - 1));
	return generateDateRange(start, end);
};

const bucketDates = (dates: string[]) =>
	bucketDayIndexes(dates.length).map(({ from, to }) => ({ start: dates[from], end: dates[to - 1] }));

describe("bucketDayIndexes", () => {
	it("keeps a point per day for a week or a month", () => {
		expect(bucketDates(days(7))).toHaveLength(7);
		const month = bucketDates(days(30));
		expect(month).toHaveLength(30);
		expect(month.every((bucket) => bucket.start === bucket.end)).toBe(true);
	});

	it("plots three months to a year as weeks ending on the latest day", () => {
		const quarter = bucketDates(days(90));
		expect(quarter).toHaveLength(13);
		expect(quarter.at(-1)).toEqual({ start: "2026-06-24", end: "2026-06-30" });

		expect(bucketDates(days(180))).toHaveLength(26);
		expect(bucketDates(days(365))).toHaveLength(52);
	});

	it("folds a few leftover days into the oldest bucket instead of plotting them alone", () => {
		const dates = days(365);
		const [oldest] = bucketDates(dates);
		expect(oldest).toEqual({ start: dates[0], end: dates[7] });
	});

	it("plots ranges past a year and a half as 30-day spans", () => {
		const buckets = bucketDates(days(730));
		expect(buckets).toHaveLength(24);
		expect(buckets.at(-1)).toEqual({ start: "2026-06-01", end: "2026-06-30" });
	});

	it("covers every day exactly once", () => {
		for (const count of [1, 35, 36, 90, 365, 548, 549, 1000]) {
			const dates = days(count);
			const buckets = bucketDates(dates);
			expect(buckets[0].start).toBe(dates[0]);
			expect(buckets.at(-1)?.end).toBe(dates.at(-1));
			for (let i = 1; i < buckets.length; i++) {
				expect(dates.indexOf(buckets[i].start)).toBe(dates.indexOf(buckets[i - 1].end) + 1);
			}
		}
	});
});

describe("bucketChartData", () => {
	const points = (count: number, value: (index: number) => Record<string, number | null | undefined>) =>
		days(count).map((date, index) => ({ date, ...value(index) }));

	it("leaves a daily range untouched", () => {
		const daily = points(30, () => ({ brand: 50 }));
		expect(bucketChartData(daily, ["brand"])).toBe(daily);
	});

	it("weighs each day by its runs, giving the percentage over the whole bucket", () => {
		// The last week: one day at 100% over 1 run, one at 0% over 9 runs.
		const data = points(90, (index) => {
			if (index === 88) return { brand: 100, [RUNS_KEY]: 1 };
			if (index === 89) return { brand: 0, [RUNS_KEY]: 9 };
			return { brand: null };
		});
		const bucketed = bucketChartData(data, ["brand"]);
		expect(bucketed).toHaveLength(13);
		expect(bucketed.at(-1)?.brand).toBe(10);
	});

	it("has no value for a bucket in which nothing ran", () => {
		const data = points(90, (index) => (index === 89 ? { brand: 40, [RUNS_KEY]: 2 } : { brand: null }));
		const bucketed = bucketChartData(data, ["brand"]);
		expect(bucketed[0].brand).toBeNull();
		expect(bucketed.at(-1)?.brand).toBe(40);
	});
});

describe("bucketAnchorIndexes", () => {
	it("draws a point on every day of a daily range", () => {
		expect(bucketAnchorIndexes(30)).toEqual(Array.from({ length: 30 }, (_, i) => i));
	});

	it("spans the chart edge to edge, each point within the days it stands for", () => {
		for (const count of [36, 90, 365, 730]) {
			const anchors = bucketAnchorIndexes(count);
			const ranges = bucketDayIndexes(count);
			expect(anchors[0]).toBe(0);
			expect(anchors.at(-1)).toBe(count - 1);
			anchors.forEach((day, i) => {
				expect(day).toBeGreaterThanOrEqual(ranges[i].from);
				expect(day).toBeLessThan(ranges[i].to);
			});
		}
	});
});
