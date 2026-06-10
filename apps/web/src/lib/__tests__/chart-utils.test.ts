import { describe, it, expect } from "vitest";
import { citationDateWindow, applyPerPromptKeyedLVCF } from "@/lib/chart-utils";
import { toRoundedPercentages } from "@/lib/domain-categories";

describe("citationDateWindow", () => {
	it("builds a `days`-day current window + contiguous equal-length previous window (UTC)", () => {
		const w = citationDateWindow(new Date("2026-06-09T15:30:00Z"), 7);
		expect(w.toDateStr).toBe("2026-06-09");
		expect(w.fromDateStr).toBe("2026-06-03"); // 7 days inclusive of today
		expect(w.dateRange).toEqual([
			"2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-07", "2026-06-08", "2026-06-09",
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
