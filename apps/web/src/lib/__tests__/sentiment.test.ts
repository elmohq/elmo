import { describe, expect, it } from "vitest";
import { sentimentSeries } from "@/lib/sentiment";

const day = (date: string, positive: number, negative: number, neutral = 0) => ({
	date,
	positive_runs: positive,
	neutral_runs: neutral,
	negative_runs: negative,
	mixed_runs: 0,
	uncertain_mention_runs: 0,
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

	it("has no value for a stretch without judged mentions", () => {
		const series = sentimentSeries([day("2026-03-01", 1, 0)], dates, 2);
		expect(series.map((p) => p.positive)).toEqual([100, 100, null, null]);
	});

	it("counts neutral mentions in the whole, so a mostly neutral brand isn't shown as all positive", () => {
		const [point] = sentimentSeries([day("2026-03-01", 1, 0, 3)], dates.slice(0, 1));
		expect(point.positive).toBe(25);
	});
});
