import { describe, it, expect } from "vitest";
import { citationDateWindow } from "@/lib/chart-utils";

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
