import { describe, expect, it } from "vitest";
import { positionSeries, sentimentSeries } from "@/lib/sentiment";

const day = (date: string, positive: number, negative: number, neutral = 0) => ({
	date,
	positive_runs: positive,
	neutral_runs: neutral,
	negative_runs: negative,
	mixed_runs: 0,
	position_sum: 0,
	positioned_runs: 0,
});

describe("sentimentSeries", () => {
	const dates = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04"];

	it("shares positive and negative mentions over a trailing window", () => {
		const series = sentimentSeries([day("2026-03-01", 3, 1), day("2026-03-03", 0, 4)], dates, 2);
		expect(series.map((p) => [p.positive, p.negative])).toEqual([
			[75, 25],
			[75, 25],
			[0, 100],
			[0, 100],
		]);
	});

	it("fills the first days' window from mentions before the range", () => {
		const series = sentimentSeries([day("2026-02-28", 0, 3), day("2026-03-01", 1, 0)], dates.slice(0, 1), 2);
		expect(series[0]).toMatchObject({ positive: 25, negative: 75 });
	});

	it("has no value for a stretch without judged mentions", () => {
		const series = sentimentSeries([day("2026-03-01", 1, 0)], dates, 2);
		expect(series.map((p) => p.positive)).toEqual([100, 100, null, null]);
	});

	it("counts neutral mentions in the whole, so a mostly neutral brand isn't shown as all positive", () => {
		const [point] = sentimentSeries([day("2026-03-01", 1, 0, 3)], dates.slice(0, 1));
		expect(point.positive).toBe(25);
	});
});

describe("positionSeries", () => {
	const ranked = (date: string, sum: number, runs: number) => ({
		date,
		positive_runs: 0,
		neutral_runs: 0,
		negative_runs: 0,
		mixed_runs: 0,
		position_sum: sum,
		positioned_runs: runs,
	});

	it("averages the brand's position over the trailing window", () => {
		const series = positionSeries(
			[ranked("2026-03-01", 3, 2), ranked("2026-03-02", 6, 2)],
			["2026-03-01", "2026-03-02"],
			2,
		);
		expect(series.map((p) => p.average)).toEqual([1.5, 2.3]);
	});

	it("has no value while the brand is never ranked", () => {
		expect(positionSeries([], ["2026-03-01"])[0].average).toBeNull();
	});
});
