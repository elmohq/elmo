import { describe, expect, it } from "vitest";
import { parseAnalyticsWindow, parsePaging, publicRange } from "../analytics-range";

const WINDOW = "start=2026-01-01T00:00:00Z&end=2026-02-01T00:00:00Z";

describe("analytics API query parsing", () => {
	it("rejects malformed pagination instead of silently coercing it", () => {
		expect(() => parsePaging(new URL("https://example.com?page=abc"))).toThrow("page must be a positive integer");
		expect(() => parsePaging(new URL("https://example.com?limit=101"))).toThrow(
			"limit must be an integer between 1 and 100",
		);
	});

	it("requires both bounds of the window", () => {
		expect(() => parseAnalyticsWindow(new URL("https://example.com?start=2026-01-01T00:00:00Z"))).toThrow(
			"both start and end",
		);
	});

	it("refuses a bare date, which means a local day on the snapshot endpoint", () => {
		expect(() => parseAnalyticsWindow(new URL("https://example.com?start=2026-01-01&end=2026-01-31"))).toThrow(
			"a bare date is not accepted",
		);
	});

	it("rejects a timestamp that isn't one", () => {
		expect(() => parseAnalyticsWindow(new URL(`https://example.com?start=yesterday&end=2026-02-01T00:00:00Z`))).toThrow(
			"must be an ISO 8601 timestamp",
		);
	});

	it("rejects a window that runs backwards, and an empty one", () => {
		const backwards = "start=2026-02-01T00:00:00Z&end=2026-01-01T00:00:00Z";
		const empty = "start=2026-01-01T00:00:00Z&end=2026-01-01T00:00:00Z";
		expect(() => parseAnalyticsWindow(new URL(`https://example.com?${backwards}`))).toThrow("start must be before end");
		expect(() => parseAnalyticsWindow(new URL(`https://example.com?${empty}`))).toThrow("start must be before end");
	});

	it("keeps the instant the caller sent, normalized to UTC", () => {
		// An offset is what makes a timestamp self-describing: -05:00 midnight is
		// 05:00 UTC, and the window has to land on that moment rather than on the
		// UTC midnight that shares its date.
		const window = parseAnalyticsWindow(
			new URL("https://example.com?start=2026-01-01T00:00:00-05:00&end=2026-02-01T00:00:00-05:00"),
		);
		expect(publicRange(window)).toEqual({ start: "2026-01-01T05:00:00.000Z", end: "2026-02-01T05:00:00.000Z" });
	});

	it("labels daily buckets in UTC, with nothing a caller can say about it", () => {
		expect(parseAnalyticsWindow(new URL(`https://example.com?${WINDOW}&timezone=Pacific/Auckland`)).timezone).toBe(
			"UTC",
		);
	});
});
