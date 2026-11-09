import { describe, expect, it } from "vitest";
import { z } from "zod";
import { publicRange, resolveAnalyticsWindow } from "../analytics-range";
import { analyticsListPaging, analyticsQuery, offsetOf, paging } from "../query";

/** The query as a route reads it, failing as the handler would answer `400`. */
function parsed<T>(schema: z.ZodType<T>, search: string): T {
	const result = schema.safeParse(Object.fromEntries(new URLSearchParams(search)));
	if (!result.success) throw new Error(result.error.issues.map((issue) => issue.message).join("; "));
	return result.data;
}

function parseAnalyticsWindow(search: string) {
	const { start, end } = parsed(analyticsQuery, search);
	return resolveAnalyticsWindow(start, end);
}

const WINDOW = "start=2026-01-01T00:00:00Z&end=2026-02-01T00:00:00Z";

describe("analytics API query parsing", () => {
	it("clamps pagination into range rather than refusing it", () => {
		const read = (search: string) => parsed(z.object(paging), search);
		expect(read("")).toEqual({ page: 1, limit: 20 });
		expect(read("page=0&limit=101")).toEqual({ page: 1, limit: 100 });
		expect(read("page=abc&limit=abc")).toEqual({ page: 1, limit: 20 });
	});

	it("pages the analytics lists 1000 at a time by default, clamping out-of-range and unreadable values", () => {
		const read = (search: string) => {
			const query = parsed(z.object(analyticsListPaging), search);
			return { ...query, offset: offsetOf(query) };
		};
		expect(read("")).toEqual({ page: 1, limit: 1000, offset: 0 });
		expect(read("page=3&limit=50")).toEqual({ page: 3, limit: 50, offset: 100 });
		expect(read("limit=5000")).toMatchObject({ limit: 1000 });
		expect(read("page=x&limit=abc")).toEqual({ page: 1, limit: 1000, offset: 0 });
	});

	it("requires both bounds of the window", () => {
		expect(() => parseAnalyticsWindow("start=2026-01-01T00:00:00Z")).toThrow("is required");
	});

	it("refuses a bare date, which means a local day on the snapshot endpoint", () => {
		expect(() => parseAnalyticsWindow("start=2026-01-01&end=2026-01-31")).toThrow("a bare date is not accepted");
	});

	it("rejects a timestamp that isn't one", () => {
		expect(() => parseAnalyticsWindow(`start=yesterday&end=2026-02-01T00:00:00Z`)).toThrow(
			"must be an ISO 8601 timestamp",
		);
	});

	it("refuses a timestamp without an offset, which would otherwise be read in the server's time zone", () => {
		expect(() => parseAnalyticsWindow("start=2026-01-01T00:00:00&end=2026-02-01T00:00:00Z")).toThrow(
			"must be an ISO 8601 timestamp",
		);
	});

	it("refuses a timestamp without an offset from the MCP tools too, which pass the window as plain values", () => {
		expect(() => resolveAnalyticsWindow("2026-01-01T00:00:00", "2026-02-01T00:00:00Z")).toThrow(
			"start must be an ISO 8601 timestamp with an offset",
		);
	});

	it("rejects a window that runs backwards, and an empty one", () => {
		const backwards = "start=2026-02-01T00:00:00Z&end=2026-01-01T00:00:00Z";
		const empty = "start=2026-01-01T00:00:00Z&end=2026-01-01T00:00:00Z";
		expect(() => parseAnalyticsWindow(backwards)).toThrow("start must be before end");
		expect(() => parseAnalyticsWindow(empty)).toThrow("start must be before end");
	});

	it.each<[string, string, string, string]>([
		["mid-bucket bounds", "2026-01-01T00:17:33Z", "2026-02-01T10:59:59.999Z", "2026-01-01T00:15:00.000Z"],
		["the last quarter of the hour", "2026-01-01T00:47:00Z", "2026-02-01T10:59:59.999Z", "2026-01-01T00:45:00.000Z"],
	])("floors %s down to the quarter hour the analytics are bucketed by", (_label, start, end, expectedStart) => {
		const window = parseAnalyticsWindow(`start=${start}&end=${end}`);

		expect(publicRange(window)).toEqual({ start: expectedStart, end: "2026-02-01T10:45:00.000Z" });
	});

	it("refuses a window that alignment collapses to nothing", () => {
		expect(() => parseAnalyticsWindow("start=2026-01-01T10:05:00Z&end=2026-01-01T10:10:00Z")).toThrow(
			"same quarter-hour bucket",
		);
	});

	it("keeps the instant the caller sent, normalized to UTC", () => {
		// An offset is what makes a timestamp self-describing: -05:00 midnight is
		// 05:00 UTC, and the window has to land on that moment rather than on the
		// UTC midnight that shares its date.
		const window = parseAnalyticsWindow("start=2026-01-01T00:00:00-05:00&end=2026-02-01T00:00:00-05:00");
		expect(publicRange(window)).toEqual({ start: "2026-01-01T05:00:00.000Z", end: "2026-02-01T05:00:00.000Z" });
	});

	it("labels daily buckets in UTC, with nothing a caller can say about it", () => {
		expect(parseAnalyticsWindow(`${WINDOW}&timezone=Pacific/Auckland`).timezone).toBe("UTC");
	});
});
