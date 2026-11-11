import { describe, expect, it } from "vitest";
import { type DatedPage, newest, pageLastUpdated } from "@/lib/page-dates";

function page(fields: { type?: string; data: Record<string, unknown> }): DatedPage {
	return fields as unknown as DatedPage;
}

describe("newest", () => {
	it("returns the latest date wherever it is in the list", () => {
		expect(newest(["2026-01-05", "2026-03-01", "2025-12-31"])).toBe("2026-03-01");
		expect(newest(["2026-03-01", "2025-12-31", "2026-01-05"])).toBe("2026-03-01");
	});

	it("compares dates across year and month boundaries", () => {
		expect(newest(["2025-12-31", "2026-01-01"])).toBe("2026-01-01");
		expect(newest(["2026-09-30", "2026-10-01"])).toBe("2026-10-01");
	});

	it("returns a repeated date once", () => {
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

	it("leaves the list it was given unchanged", () => {
		const input = ["2026-03-01", undefined, "2026-01-01"];
		newest(input);
		expect(input).toEqual(["2026-03-01", undefined, "2026-01-01"]);
	});
});

describe("pageLastUpdated", () => {
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

	it("gives API reference pages the fixed API reference date", () => {
		expect(pageLastUpdated(page({ type: "openapi", data: {} }))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("ignores an API reference page's own updated date", () => {
		expect(pageLastUpdated(page({ type: "openapi", data: { updated: "2020-01-01" } }))).not.toBe("2020-01-01");
	});
});
