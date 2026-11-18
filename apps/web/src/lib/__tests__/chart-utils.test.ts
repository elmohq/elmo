import { toRoundedPercentages } from "@workspace/lib/citations/domain-categories";
import { describe, expect, it } from "vitest";
import {
	applyPerPromptKeyedLVCF,
	citationDateWindow,
	filterAndCompleteChartData,
	fromBatchChartColumns,
	generateDateRange,
	getDaysFromLookback,
	type ProcessedBatchChartDataPoint,
	toBatchChartColumns,
	toBatchChartData,
	visibilityOverWindow,
} from "@/lib/chart-utils";

import type { LookbackPeriod } from "@/lib/lookback";

describe("getDaysFromLookback", () => {
	it.each<[LookbackPeriod, number]>([
		["1w", 7],
		["1m", 30],
		["3m", 90],
		["6m", 180],
		["1y", 365],
		["all", 365 * 2],
		["2026-03-01..2026-03-01", 1],
		["2026-02-01..2026-03-01", 29],
		["2025-12-31..2026-01-01", 2],
	])("maps %s to %i days", (lookback, days) => {
		expect(getDaysFromLookback(lookback)).toBe(days);
	});
});

describe("generateDateRange", () => {
	it.each<[string, string, string, string[]]>([
		[
			"inclusive ascending list of YYYY-MM-DD days",
			"2026-06-10T00:00:00Z",
			"2026-06-14T00:00:00Z",
			["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14"],
		],
		["single day when start equals end", "2026-06-10T00:00:00Z", "2026-06-10T00:00:00Z", ["2026-06-10"]],
		["empty range when end precedes start", "2026-06-14T00:00:00Z", "2026-06-10T00:00:00Z", []],
	])("produces %s", (_label, start, end, expected) => {
		expect(generateDateRange(new Date(start), new Date(end))).toEqual(expected);
	});
});

describe("citationDateWindow", () => {
	it("builds a `days`-day current window + contiguous equal-length previous window (UTC)", () => {
		const w = citationDateWindow(new Date("2026-06-09T15:30:00Z"), 7);
		expect(w.toDateStr).toBe("2026-06-09");
		expect(w.fromDateStr).toBe("2026-06-03"); // 7 days inclusive of today
		expect(w.dateRange).toEqual([
			"2026-06-03",
			"2026-06-04",
			"2026-06-05",
			"2026-06-06",
			"2026-06-07",
			"2026-06-08",
			"2026-06-09",
		]);
		expect(w.dateRange).toHaveLength(7);
		// previous window: same length, ends the day before the current window starts (no gap, no overlap)
		expect(w.prevToDateStr).toBe("2026-06-02");
		expect(w.prevFromDateStr).toBe("2026-05-27");
	});

	it("treats days=1 as a single day; previous is the day before", () => {
		const w = citationDateWindow(new Date("2026-06-09T00:00:00Z"), 1);
		expect(w.fromDateStr).toBe("2026-06-09");
		expect(w.toDateStr).toBe("2026-06-09");
		expect(w.dateRange).toEqual(["2026-06-09"]);
		expect(w.prevFromDateStr).toBe("2026-06-08");
		expect(w.prevToDateStr).toBe("2026-06-08");
	});

	it("crosses month/year boundaries correctly", () => {
		const w = citationDateWindow(new Date("2026-01-02T12:00:00Z"), 7);
		expect(w.fromDateStr).toBe("2025-12-27");
		expect(w.toDateStr).toBe("2026-01-02");
		expect(w.prevToDateStr).toBe("2025-12-26");
		expect(w.prevFromDateStr).toBe("2025-12-20");
	});

	it("resolves the UTC calendar day regardless of time-of-day (server-TZ independent)", () => {
		const w = citationDateWindow(new Date("2026-06-09T23:59:59Z"), 7);
		expect(w.toDateStr).toBe("2026-06-09");
		expect(w.fromDateStr).toBe("2026-06-03");
	});
});

describe("applyPerPromptKeyedLVCF", () => {
	const rows = [
		{ prompt_id: "p1", date: "2026-06-01", key: "brand", count: 3 },
		{ prompt_id: "p1", date: "2026-06-01", key: "editorial", count: 1 },
		{ prompt_id: "p2", date: "2026-06-02", key: "editorial", count: 5 },
	];
	const range = ["2026-06-01", "2026-06-02"];
	const keys = ["brand", "editorial", "other"];

	it("yields identical percentages regardless of cadenceHours (cadence cancels exactly)", () => {
		// If the intermediate Math.round ever comes back, the weekly cadence would
		// pre-zero the sub-1 daily rates and these would diverge — this pins that.
		const daily = applyPerPromptKeyedLVCF(rows, range, 24, keys); // daily cadence
		const weekly = applyPerPromptKeyedLVCF(rows, range, 168, keys); // weekly cadence
		for (const date of range) {
			expect(toRoundedPercentages(daily.get(date)!)).toEqual(toRoundedPercentages(weekly.get(date)!));
		}
	});

	it("carries each prompt's last value forward to fill gap days", () => {
		// p1 only ran on 06-01; its values are carried into 06-02.
		const daily = applyPerPromptKeyedLVCF(rows, range, 24, keys);
		expect(toRoundedPercentages(daily.get("2026-06-01")!)).toEqual({ brand: 33, editorial: 67, other: 0 });
		expect(toRoundedPercentages(daily.get("2026-06-02")!)).toEqual({ brand: 33, editorial: 67, other: 0 });
	});
});

describe("filterAndCompleteChartData with a custom range", () => {
	it("plots exactly the chosen days, filling gaps and dropping points outside", () => {
		const data = [
			{ date: "2026-02-27", brand: 10 },
			{ date: "2026-03-01", brand: 40 },
			{ date: "2026-03-03", brand: 60 },
			{ date: "2026-03-05", brand: 90 },
		];

		expect(filterAndCompleteChartData(data, "2026-03-01..2026-03-04")).toEqual([
			{ date: "2026-03-01", brand: 40 },
			{ date: "2026-03-02" },
			{ date: "2026-03-03", brand: 60 },
			{ date: "2026-03-04" },
		]);
	});
});

describe("toBatchChartData", () => {
	const day = (prompt_id: string, date: string, runs: number, brand_mentioned_runs: number) => ({
		prompt_id,
		date,
		runs,
		brand_mentioned_runs,
		competitor_runs: 0,
		competitor_mentions: 0,
	});

	it("attaches each competitor's runs to the same prompt and day", () => {
		const points = toBatchChartData(
			[day("p1", "2026-03-01", 4, 1), day("p1", "2026-03-02", 2, 2), day("p2", "2026-03-01", 3, 0)],
			[
				{ prompt_id: "p1", date: "2026-03-01", competitor: "Globex", runs: 2 },
				{ prompt_id: "p1", date: "2026-03-01", competitor: "Initech", runs: 1 },
				{ prompt_id: "p2", date: "2026-03-01", competitor: "Globex", runs: 3 },
			],
		);

		expect(points).toEqual([
			{
				prompt_id: "p1",
				date: "2026-03-01",
				total_runs: 4,
				brand_mentioned_count: 1,
				competitor_counts: { Globex: 2, Initech: 1 },
			},
			{ prompt_id: "p1", date: "2026-03-02", total_runs: 2, brand_mentioned_count: 2, competitor_counts: {} },
			{
				prompt_id: "p2",
				date: "2026-03-01",
				total_runs: 3,
				brand_mentioned_count: 0,
				competitor_counts: { Globex: 3 },
			},
		]);
	});
});

describe("toBatchChartColumns", () => {
	const points: ProcessedBatchChartDataPoint[] = [
		{
			prompt_id: "p1",
			date: "2026-03-01",
			total_runs: 4,
			brand_mentioned_count: 1,
			competitor_counts: { Globex: 2, Initech: 1 },
		},
		{ prompt_id: "p1", date: "2026-03-02", total_runs: 2, brand_mentioned_count: 2, competitor_counts: {} },
		{ prompt_id: "p2", date: "2026-03-01", total_runs: 3, brand_mentioned_count: 0, competitor_counts: { Globex: 3 } },
	];

	it("survives the trip to the browser as JSON text unchanged", () => {
		const received = JSON.parse(JSON.stringify(toBatchChartColumns(points)));

		expect(fromBatchChartColumns(received)).toEqual(points);
	});

	it("carries nothing for a brand with no runs", () => {
		expect(fromBatchChartColumns(toBatchChartColumns([]))).toEqual([]);
	});
});

describe("visibilityOverWindow", () => {
	const range = ["2026-03-01", "2026-03-02", "2026-03-03"];
	const day = (prompt_id: string, date: string, total_runs: number, brand_mentioned_count: number) => ({
		prompt_id,
		date,
		total_runs,
		brand_mentioned_count,
		competitor_counts: {},
	});
	const points = [day("p1", "2026-03-01", 2, 2), day("p1", "2026-03-03", 2, 0), day("p2", "2026-03-03", 2, 0)];

	it("carries a prompt's latest result across days it did not run", () => {
		const { visibilityTimeSeries, currentVisibilityPct } = visibilityOverWindow(points, new Set(["p1"]), range);

		expect(visibilityTimeSeries.map((point) => point.visibility)).toEqual([100, 100, 0]);
		expect(currentVisibilityPct).toBe(0);
	});

	it("counts a prompt from the start of the window with its first result", () => {
		const { visibilityTimeSeries } = visibilityOverWindow(points, new Set(["p1", "p2"]), range);

		expect(visibilityTimeSeries.map((point) => point.visibility)).toEqual([50, 50, 0]);
	});

	it("covers only the prompts asked for, and totals the runs that actually happened", () => {
		expect(visibilityOverWindow(points, new Set(["p2"]), range).totalRuns).toBe(2);
		expect(visibilityOverWindow(points, new Set(["p1", "p2"]), range).totalRuns).toBe(6);
	});

	it("leaves days with nothing to plot empty", () => {
		const result = visibilityOverWindow(points, new Set(["missing"]), range);

		expect(result.currentVisibilityPct).toBe(0);
		expect(result.visibilityTimeSeries.every((point) => point.visibility === null)).toBe(true);
	});
});
