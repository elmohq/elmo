import { describe, expect, it } from "vitest";
import { formatCustomLookback, lookbackSchema, parseCustomLookback } from "@/lib/lookback";

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
