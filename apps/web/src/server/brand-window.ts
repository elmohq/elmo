import { getDaysFromLookback } from "@/lib/chart-utils";
import { type LookbackPeriod, parseCustomLookback } from "@/lib/lookback";
import { getBrandEarliestRunDate } from "@/lib/postgres-read";
import {
	type BoundedLookbackPeriod,
	type CalendarDayRange,
	calendarDayInTimezone,
	getBoundedLookbackRange,
	resolveTimezone,
} from "@/lib/timezone-utils";

export type BrandWindow = { timezone: string } & CalendarDayRange;

export async function resolveBrandWindow(
	brandId: string,
	lookback: LookbackPeriod,
	timezoneParam: string,
	options?: { now?: Date },
): Promise<BrandWindow> {
	const timezone = resolveTimezone(timezoneParam);
	const now = options?.now ?? new Date();

	const custom = parseCustomLookback(lookback);
	if (!custom && lookback !== "all") {
		return { timezone, ...getBoundedLookbackRange(lookback as BoundedLookbackPeriod, timezone, { now }) };
	}

	const toDateStr = custom?.to ?? calendarDayInTimezone(timezone, now);
	if (custom?.from) return { timezone, fromDateStr: custom.from, toDateStr };

	// "all", and a custom range with an open start, begin at the brand's first run.
	const earliest = await getBrandEarliestRunDate(brandId);
	// A brand with no runs gets an empty window rather than an open-ended one, so
	// the charts draw a single day of nothing instead of a decade of it.
	if (!earliest) return { timezone, fromDateStr: toDateStr, toDateStr };

	const earliestDay = calendarDayInTimezone(timezone, new Date(earliest));
	return { timezone, fromDateStr: earliestDay < toDateStr ? earliestDay : toDateStr, toDateStr };
}

/** The same lookback as a count of days ending today, for the pages that
 * still window by day count in UTC rather than by calendar range. */
export async function resolveBrandLookbackDays(
	brandId: string,
	lookback: LookbackPeriod,
	options?: { now?: Date },
): Promise<number> {
	if (lookback !== "all" && !parseCustomLookback(lookback)) return getDaysFromLookback(lookback);
	const { fromDateStr, toDateStr } = await resolveBrandWindow(brandId, lookback, "UTC", options);
	return Math.round((Date.parse(toDateStr) - Date.parse(fromDateStr)) / 86_400_000) + 1;
}
