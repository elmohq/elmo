import { describe, expect, it } from "vitest";
import { paginate, parseAnalyticsWindow, parsePaging } from "../analytics-range";

describe("analytics API query parsing", () => {
	it("rejects malformed pagination instead of silently coercing it", () => {
		expect(() => parsePaging(new URL("https://example.com?page=abc"))).toThrow("page must be a positive integer");
		expect(() => parsePaging(new URL("https://example.com?limit=101"))).toThrow(
			"limit must be an integer between 1 and 100",
		);
	});

	it("reports zero pages for an empty result", () => {
		expect(paginate([], 1, 20).pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
	});

	it("rejects an invalid timezone", () => {
		expect(() => parseAnalyticsWindow(new URL("https://example.com?lookback=1m&timezone=Not/AZone"))).toThrow(
			"timezone must be a valid IANA time zone",
		);
	});
});
