import { describe, expect, it } from "vitest";
import { parseAnalyticsWindow, parsePaging } from "../analytics-range";

const WINDOW = "startDate=2026-01-01&endDate=2026-01-31";

describe("analytics API query parsing", () => {
	it("rejects malformed pagination instead of silently coercing it", () => {
		expect(() => parsePaging(new URL("https://example.com?page=abc"))).toThrow("page must be a positive integer");
		expect(() => parsePaging(new URL("https://example.com?limit=101"))).toThrow(
			"limit must be an integer between 1 and 100",
		);
	});

	it("rejects an invalid timezone", () => {
		expect(() => parseAnalyticsWindow(new URL(`https://example.com?${WINDOW}&timezone=Not/AZone`))).toThrow(
			"timezone must be a valid IANA time zone",
		);
	});

	it("requires both bounds of the window", () => {
		expect(() => parseAnalyticsWindow(new URL("https://example.com?startDate=2026-01-01"))).toThrow(
			"both startDate and endDate",
		);
	});

	it("rejects a date that only looks like one", () => {
		expect(() => parseAnalyticsWindow(new URL("https://example.com?startDate=2026-13-01&endDate=2026-01-31"))).toThrow(
			"valid dates in YYYY-MM-DD format",
		);
	});

	it("rejects a window that runs backwards", () => {
		expect(() => parseAnalyticsWindow(new URL("https://example.com?startDate=2026-02-01&endDate=2026-01-31"))).toThrow(
			"startDate must be before or equal to endDate",
		);
	});

	it("defaults the timezone to UTC", () => {
		expect(parseAnalyticsWindow(new URL(`https://example.com?${WINDOW}`))).toEqual({
			startDate: "2026-01-01",
			endDate: "2026-01-31",
			timezone: "UTC",
		});
	});
});
