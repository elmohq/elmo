import { afterEach, describe, expect, it, vi } from "vitest";
import type { LookbackPeriod } from "@/lib/chart-utils";
import { getTimezoneLookbackRange, resolveTimezone, shiftDateStr } from "@/lib/timezone-utils";

describe("resolveTimezone", () => {
	it("returns a valid timezone unchanged", () => {
		expect(resolveTimezone("America/New_York", "UTC")).toBe("America/New_York");
	});

	it("uses the resolved fallback when the requested timezone is invalid", () => {
		expect(resolveTimezone("Not/A_Timezone", "Europe/London")).toBe("Europe/London");
	});

	it.each<[string | undefined]>([[undefined], [""]])(
		"uses an explicit fallback when the timezone is %s",
		(timezone) => {
			expect(resolveTimezone(timezone, "Asia/Tokyo")).toBe("Asia/Tokyo");
		},
	);

	it("uses UTC when the resolved fallback is empty", () => {
		expect(resolveTimezone(undefined, "")).toBe("UTC");
	});

	describe("without a resolved fallback", () => {
		afterEach(() => vi.unstubAllGlobals());

		it("uses the system timezone", () => {
			vi.stubGlobal("Intl", {
				DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: "Australia/Sydney" }) }),
			});

			expect(resolveTimezone(undefined, undefined)).toBe("Australia/Sydney");
		});

		it("uses UTC when the system timezone cannot be resolved", () => {
			vi.stubGlobal("Intl", {
				DateTimeFormat: () => {
					throw new Error("timezone data unavailable");
				},
			});

			expect(resolveTimezone(undefined, undefined)).toBe("UTC");
		});
	});
});

describe("shiftDateStr", () => {
	it.each<[string, string, number, string]>([
		["moves forward within a month", "2026-06-10", 5, "2026-06-15"],
		["moves backward across a month boundary", "2026-03-02", -3, "2026-02-27"],
		["moves forward across a year boundary", "2025-12-31", 1, "2026-01-01"],
	])("%s when shifting by days", (_label, dateStr, days, expected) => {
		expect(shiftDateStr(dateStr, { days })).toBe(expected);
	});

	it.each<[string, string, number, string]>([
		["moves forward", "2026-04-15", 2, "2026-06-15"],
		["moves backward across a year boundary", "2026-01-15", -2, "2025-11-15"],
		["normalizes forward overflow", "2026-01-15", 13, "2027-02-15"],
		["normalizes backward underflow", "2026-01-15", -13, "2024-12-15"],
		["clamps to leap-year February", "2024-01-31", 1, "2024-02-29"],
		["clamps to non-leap-year February", "2023-01-31", 1, "2023-02-28"],
		["clamps when moving backward to a shorter month", "2026-05-31", -1, "2026-04-30"],
	])("%s when shifting by months", (_label, dateStr, months, expected) => {
		expect(shiftDateStr(dateStr, { months })).toBe(expected);
	});

	it.each<[string, string, number, string]>([
		["moves forward", "2026-06-10", 2, "2028-06-10"],
		["moves backward", "2026-06-10", -2, "2024-06-10"],
		["clamps leap day in a non-leap target year", "2024-02-29", 1, "2025-02-28"],
		["preserves leap day in a leap target year", "2024-02-29", 4, "2028-02-29"],
	])("%s when shifting by years", (_label, dateStr, years, expected) => {
		expect(shiftDateStr(dateStr, { years })).toBe(expected);
	});

	it("applies day shifts after clamping month-end", () => {
		expect(shiftDateStr("2024-01-31", { months: 1, days: 1 })).toBe("2024-03-01");
	});

	it("leaves the date unchanged when no shift is provided", () => {
		expect(shiftDateStr("2026-06-10", {})).toBe("2026-06-10");
	});
});

describe("getTimezoneLookbackRange", () => {
	const now = new Date("2024-03-31T12:00:00Z");

	it.each<[LookbackPeriod, string | null, string | null]>([
		["1w", "2024-03-25", "2024-03-31"],
		["1m", "2024-02-29", "2024-03-31"],
		["3m", "2023-12-31", "2024-03-31"],
		["6m", "2023-09-30", "2024-03-31"],
		["1y", "2023-03-31", "2024-03-31"],
		["all", null, null],
	])("returns the expected UTC range for %s", (lookback, fromDateStr, toDateStr) => {
		expect(getTimezoneLookbackRange(lookback, "UTC", { now })).toEqual({ fromDateStr, toDateStr });
	});

	it.each<["none" | "1y", string | null, string | null]>([
		["none", null, null],
		["1y", "2023-03-31", "2024-03-31"],
	])("applies the %s strategy to the all lookback", (allStrategy, fromDateStr, toDateStr) => {
		expect(getTimezoneLookbackRange("all", "UTC", { now, allStrategy })).toEqual({
			fromDateStr,
			toDateStr,
		});
	});

	it.each<[string, string, string]>([
		["UTC", "2025-12-25", "2025-12-31"],
		["Asia/Tokyo", "2025-12-26", "2026-01-01"],
	])("uses the calendar date in %s at a UTC day boundary", (timezone, fromDateStr, toDateStr) => {
		const boundaryNow = new Date("2025-12-31T23:30:00Z");

		expect(getTimezoneLookbackRange("1w", timezone, { now: boundaryNow })).toEqual({
			fromDateStr,
			toDateStr,
		});
	});

	// New York switches to EDT on 2024-03-10 and back to EST on 2024-11-03, so local
	// midnight lands at a different UTC instant on either side of each transition.
	it.each<[string, string, string, string]>([
		["before local midnight on the spring-forward day", "2024-03-10T04:59:00Z", "2024-03-03", "2024-03-09"],
		["after the spring-forward transition", "2024-03-10T12:00:00Z", "2024-03-04", "2024-03-10"],
		["before local midnight on the fall-back day", "2024-11-03T03:59:00Z", "2024-10-27", "2024-11-02"],
	])("spans seven calendar days %s", (_label, nowIso, fromDateStr, toDateStr) => {
		expect(getTimezoneLookbackRange("1w", "America/New_York", { now: new Date(nowIso) })).toEqual({
			fromDateStr,
			toDateStr,
		});
	});
});
