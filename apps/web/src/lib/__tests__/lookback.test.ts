import { describe, expect, it } from "vitest";
import {
	customRangeEnd,
	daysInRange,
	formatCustomLookback,
	isLookbackPeriod,
	isLookbackPreset,
	lookbackSchema,
	parseCustomLookback,
} from "@/lib/lookback";

describe("custom lookback ranges", () => {
	it("round-trips a range through its URL value", () => {
		const value = formatCustomLookback({ from: "2026-01-05", to: "2026-02-10" });
		expect(value).toBe("2026-01-05..2026-02-10");
		expect(parseCustomLookback(value)).toEqual({ from: "2026-01-05", to: "2026-02-10" });
	});

	it("accepts a single-day range", () => {
		expect(parseCustomLookback("2026-03-01..2026-03-01")).toEqual({ from: "2026-03-01", to: "2026-03-01" });
	});

	it.each([
		["a start date alone", "2026-03-01..", { from: "2026-03-01", to: null }],
		["an end date alone", "..2026-03-01", { from: null, to: "2026-03-01" }],
	])("accepts %s", (_label, value, range) => {
		expect(parseCustomLookback(value)).toEqual(range);
		expect(formatCustomLookback(range)).toBe(value);
	});

	it.each([
		["neither date", ".."],
		["an inverted range", "2026-02-10..2026-01-05"],
		["an impossible date", "2026-02-30..2026-03-01"],
		["a different separator", "2026-01-05_2026-02-10"],
		["a preset", "1m"],
	])("rejects %s", (_label, value) => {
		expect(parseCustomLookback(value)).toBeNull();
	});

	it.each(["1w", "all", "2026-01-05..2026-02-10"])("validates %s as a lookback", (value) => {
		expect(lookbackSchema.safeParse(value).success).toBe(true);
	});

	it.each(["2w", "2026-02-10..2026-01-05", ""])("rejects %j as a lookback", (value) => {
		expect(lookbackSchema.safeParse(value).success).toBe(false);
	});
});

describe("isLookbackPreset", () => {
	it.each(["1w", "1m", "3m", "6m", "1y", "all"])("accepts the %s preset", (value) => {
		expect(isLookbackPreset(value)).toBe(true);
	});

	it.each([
		["a value that is not a preset", "2w"],
		["the wrong case", "1W"],
		["a leading space", " 1m"],
		["an empty string", ""],
		["a custom range", "2026-01-05..2026-02-10"],
		["null", null],
		["undefined", undefined],
		["a number", 7],
	])("rejects %s", (_label, value) => {
		expect(isLookbackPreset(value)).toBe(false);
	});
});

describe("isLookbackPeriod", () => {
	it.each([
		["a preset", "1w"],
		["the all preset", "all"],
		["a closed custom range", "2026-01-05..2026-02-10"],
		["a range with an open end", "2026-01-05.."],
		["a range with an open start", "..2026-02-10"],
	])("accepts %s", (_label, value) => {
		expect(isLookbackPeriod(value)).toBe(true);
	});

	it.each([
		["a range with no dates", ".."],
		["an inverted range", "2026-02-10..2026-01-05"],
		["an impossible date", "2026-02-30..2026-03-01"],
		["dates that are not zero-padded", "2026-1-5..2026-2-10"],
		["a value that is not a preset", "2w"],
		["an empty string", ""],
		["a number", 42],
		["null", null],
	])("rejects %s", (_label, value) => {
		expect(isLookbackPeriod(value)).toBe(false);
	});
});

describe("customRangeEnd", () => {
	it.each([
		["a closed range", "2026-01-05..2026-02-10", "2026-02-10"],
		["a range with an open start", "..2026-02-10", "2026-02-10"],
	])("returns the fixed last day of %s", (_label, lookback, end) => {
		expect(customRangeEnd(lookback as `${string}..${string}`)).toBe(end);
	});

	it.each([
		["an open-ended range", "2026-01-05.."],
		["the 1m preset", "1m"],
		["the all preset", "all"],
		["an invalid range", "2026-02-10..2026-01-05"],
	])("has no fixed end for %s", (_label, lookback) => {
		expect(customRangeEnd(lookback as `${string}..${string}`)).toBeUndefined();
	});
});

describe("daysInRange", () => {
	it.each([
		["a single day", "2026-03-01", "2026-03-01", 1],
		["a week", "2026-03-01", "2026-03-07", 7],
		["a 31-day month", "2026-01-01", "2026-01-31", 31],
		["February in a common year", "2026-02-01", "2026-03-01", 29],
		["February in a leap year", "2024-02-01", "2024-03-01", 30],
		["a range across a year boundary", "2025-12-31", "2026-01-01", 2],
		["a full common year", "2026-01-01", "2026-12-31", 365],
		["a full leap year", "2024-01-01", "2024-12-31", 366],
		["a range spanning the US daylight-saving change", "2026-03-07", "2026-03-09", 3],
	])("counts both ends for %s", (_label, from, to, days) => {
		expect(daysInRange({ from, to })).toBe(days);
	});
});
