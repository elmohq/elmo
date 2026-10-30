import { describe, expect, it } from "vitest";
import { windowMinutes, zonedMidnight } from "@/lib/brand-data/scope";

const minutes = (iso: string) => Date.parse(iso) / 60_000;

describe("brand data day boundaries", () => {
	it("starts a calendar day at local midnight, as Postgres reads it", () => {
		expect(new Date(zonedMidnight("2026-03-08", "America/New_York")).toISOString()).toBe("2026-03-08T05:00:00.000Z");
		expect(new Date(zonedMidnight("2026-03-09", "America/New_York")).toISOString()).toBe("2026-03-09T04:00:00.000Z");
		expect(new Date(zonedMidnight("2026-03-01", "Asia/Kathmandu")).toISOString()).toBe("2026-02-28T18:15:00.000Z");
	});

	it("covers whole calendar days through the last one, and instants as given", () => {
		expect(windowMinutes({ brandId: "b", from: "2026-03-01", to: "2026-03-01", timezone: "UTC" })).toEqual({
			start: minutes("2026-03-01T00:00:00Z"),
			end: minutes("2026-03-02T00:00:00Z"),
		});
		expect(
			windowMinutes({ brandId: "b", from: "2026-03-01T06:00:00Z", to: "2026-03-01T07:00:00Z", timezone: "UTC" }),
		).toEqual({ start: minutes("2026-03-01T06:00:00Z"), end: minutes("2026-03-01T07:00:00Z") });
	});
});
