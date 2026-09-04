import type { LookbackPeriod } from "@/lib/lookback";

type DateShift = {
	days?: number;
	months?: number;
	years?: number;
};

type TimezoneDateRange = {
	fromDateStr: string | null;
	toDateStr: string | null;
};

/** Every lookback but "all", which only a brand's own history can bound. */
export type BoundedLookbackPeriod = Exclude<LookbackPeriod, "all">;

export type CalendarDayRange = {
	fromDateStr: string;
	toDateStr: string;
};

export function resolveTimezone(timezoneParam?: string, resolvedFallback?: string): string {
	if (timezoneParam) {
		try {
			Intl.DateTimeFormat("en-CA", { timeZone: timezoneParam });
			return timezoneParam;
		} catch {
			// Fall through to resolved/UTC fallback
		}
	}

	const resolved =
		resolvedFallback ??
		(() => {
			try {
				return Intl.DateTimeFormat().resolvedOptions().timeZone;
			} catch {
				return undefined;
			}
		})();

	return resolved || "UTC";
}

export function shiftDateStr(dateStr: string, delta: DateShift): string {
	const [yearStr, monthStr, dayStr] = dateStr.split("-");
	const year = Number(yearStr);
	const monthIndex = Number(monthStr) - 1;
	const day = Number(dayStr);

	let targetYear = year + (delta.years ?? 0);
	let targetMonthIndex = monthIndex + (delta.months ?? 0);

	// Normalize month overflow/underflow
	if (targetMonthIndex < 0 || targetMonthIndex > 11) {
		const yearDelta = Math.floor(targetMonthIndex / 12);
		targetYear += yearDelta;
		targetMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
	}

	// Clamp day to end of target month to avoid rollover
	const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
	const clampedDay = Math.min(day, lastDayOfTargetMonth);

	const date = new Date(Date.UTC(targetYear, targetMonthIndex, clampedDay));

	if (delta.days) {
		date.setUTCDate(date.getUTCDate() + delta.days);
	}

	return date.toISOString().slice(0, 10);
}

/** The calendar day an instant falls on for a viewer in `timezone`. */
export function calendarDayInTimezone(timezone: string, instant: Date = new Date()): string {
	return instant.toLocaleDateString("en-CA", { timeZone: timezone });
}

export function getTimezoneLookbackRange(
	lookback: LookbackPeriod,
	timezone: string,
	options?: { now?: Date },
): TimezoneDateRange {
	if (lookback === "all") {
		return { fromDateStr: null, toDateStr: null };
	}
	return getBoundedLookbackRange(lookback, timezone, options);
}

export function getBoundedLookbackRange(
	lookback: BoundedLookbackPeriod,
	timezone: string,
	options?: { now?: Date },
): CalendarDayRange {
	const todayStr = calendarDayInTimezone(timezone, options?.now ?? new Date());

	switch (lookback) {
		case "1w":
			return {
				fromDateStr: shiftDateStr(todayStr, { days: -6 }), // 7 days including today
				toDateStr: todayStr,
			};
		case "1m":
			return {
				fromDateStr: shiftDateStr(todayStr, { months: -1 }),
				toDateStr: todayStr,
			};
		case "3m":
			return {
				fromDateStr: shiftDateStr(todayStr, { months: -3 }),
				toDateStr: todayStr,
			};
		case "6m":
			return {
				fromDateStr: shiftDateStr(todayStr, { months: -6 }),
				toDateStr: todayStr,
			};
		case "1y":
			return {
				fromDateStr: shiftDateStr(todayStr, { years: -1 }),
				toDateStr: todayStr,
			};
	}
}

/** For callers that pick the period themselves. A window for a period the
 * viewer chose — "all" included — comes from `resolveBrandWindow`, which can
 * ask the brand how far back its history goes. */
export function resolveLookbackRange(
	lookback: BoundedLookbackPeriod,
	timezoneParam: string,
): { timezone: string } & CalendarDayRange {
	const timezone = resolveTimezone(timezoneParam);
	return { timezone, ...getBoundedLookbackRange(lookback, timezone) };
}
