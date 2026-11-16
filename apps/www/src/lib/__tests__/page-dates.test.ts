import { afterEach, describe, expect, it, vi } from "vitest";
import { type DatedPage, newest, pageLastUpdated } from "@/lib/page-dates";

function page(fields: { type?: DatedPage["type"]; data: { date?: string; updated?: string } }): DatedPage {
	return fields as unknown as DatedPage;
}

describe("newest", () => {
	it("returns the latest date wherever it is in the list", () => {
		expect(newest(["2026-01-05", "2026-03-01", "2025-12-31"])).toBe("2026-03-01");
		expect(newest(["2026-03-01", "2025-12-31", "2026-01-05"])).toBe("2026-03-01");
		expect(newest(["2026-10-01", "2026-09-30"])).toBe("2026-10-01");
	});

	it("handles duplicate dates", () => {
		expect(newest(["2026-01-01", "2026-01-01"])).toBe("2026-01-01");
	});

	it("skips missing and empty dates", () => {
		expect(newest([undefined, "2026-02-01", undefined])).toBe("2026-02-01");
		expect(newest(["", "2026-01-01"])).toBe("2026-01-01");
	});

	it("returns undefined when there is no date to pick", () => {
		expect(newest([])).toBeUndefined();
		expect(newest([undefined, undefined])).toBeUndefined();
	});
});

describe("pageLastUpdated", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("uses a blog post's updated date when it has one", () => {
		expect(pageLastUpdated(page({ data: { date: "2026-01-10", updated: "2026-04-02" } }))).toBe("2026-04-02");
	});

	it("falls back to the publication date when a post was never updated", () => {
		expect(pageLastUpdated(page({ data: { date: "2026-01-10" } }))).toBe("2026-01-10");
	});

	it("uses a docs page's updated date", () => {
		expect(pageLastUpdated(page({ data: { updated: "2026-05-20" } }))).toBe("2026-05-20");
	});

	it("returns undefined for a docs page with no updated date", () => {
		expect(pageLastUpdated(page({ data: {} }))).toBeUndefined();
	});

	it("gives every API reference page the same date from build to build", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
		const first = pageLastUpdated(page({ type: "openapi", data: {} }));
		vi.setSystemTime(new Date("2031-06-15T00:00:00Z"));
		const second = pageLastUpdated(page({ type: "openapi", data: { updated: "2020-01-01" } }));

		expect(first).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(second).toBe(first);
		expect(first).not.toBe("2030-01-01");
	});
});
