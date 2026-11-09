import { describe, expect, it } from "vitest";
import { formatPostDate } from "@/lib/format";

describe("formatPostDate", () => {
	it("spells out the month and drops the leading zero on the day", () => {
		expect(formatPostDate("2026-05-30")).toBe("May 30, 2026");
		expect(formatPostDate("2026-01-01")).toBe("January 1, 2026");
		expect(formatPostDate("2025-12-31")).toBe("December 31, 2025");
		expect(formatPostDate("2024-02-29")).toBe("February 29, 2024");
	});

	it("returns values it can't parse unchanged", () => {
		expect(formatPostDate("")).toBe("");
		expect(formatPostDate("not-a-date")).toBe("not-a-date");
		expect(formatPostDate("2026-13-01")).toBe("2026-13-01");
		expect(formatPostDate("2026-5-3")).toBe("2026-5-3");
		expect(formatPostDate("2026-05-30T12:00:00Z")).toBe("2026-05-30T12:00:00Z");
	});
});
