import { describe, it, expect } from "vitest";
import { getTimezoneLookbackRange, resolveTimezone, shiftDateStr } from "../timezone-utils";

describe("timezone-utils", () => {
	describe("resolveTimezone", () => {
		it("returns a valid timezone param", () => {
			const result = resolveTimezone("America/Los_Angeles", "UTC");
			expect(result).toBe("America/Los_Angeles");
		});

		it("falls back when timezone param is invalid", () => {
			const result = resolveTimezone("Invalid/Zone", "America/New_York");
			expect(result).toBe("America/New_York");
		});

		it("defaults to UTC when no fallback is available", () => {
			const result = resolveTimezone(undefined, "");
			expect(result).toBe("UTC");
		});
	});

	describe("shiftDateStr", () => {
		it("shifts by days in UTC", () => {
			const result = shiftDateStr("2025-07-22", { days: -6 });
			expect(result).toBe("2025-07-16");
		});

		it("shifts by months in UTC", () => {
			const result = shiftDateStr("2025-03-31", { months: -1 });
			expect(result).toBe("2025-02-28");
		});
	});

	describe("getTimezoneLookbackRange", () => {
		it("uses the timezone date for lookback windows", () => {
			// This time is still the previous day in America/Los_Angeles
			const now = new Date("2025-07-22T01:00:00Z");
			const result = getTimezoneLookbackRange("1w", "America/Los_Angeles", { now });

			expect(result.toDateStr).toBe("2025-07-21");
			expect(result.fromDateStr).toBe("2025-07-15");
		});

		it("returns nulls for lookback=all with no strategy", () => {
			const now = new Date("2025-07-22T12:00:00Z");
			const result = getTimezoneLookbackRange("all", "UTC", { now });

			expect(result).toEqual({ fromDateStr: null, toDateStr: null });
		});

		it("returns a 1y window for lookback=all with 1y strategy", () => {
			const now = new Date("2025-07-22T12:00:00Z");
			const result = getTimezoneLookbackRange("all", "UTC", {
				now,
				allStrategy: "1y",
			});

			expect(result).toEqual({
				fromDateStr: "2024-07-22",
				toDateStr: "2025-07-22",
			});
		});
	});
});
