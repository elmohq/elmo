/**
 * The concrete window a lookback stands for, for one brand.
 *
 * "all" means all: it opens at the brand's first run rather than at a fixed
 * horizon, so the pages that share this helper cannot disagree about how far
 * back a brand's history reaches.
 */
import type { LookbackPeriod } from "@/lib/lookback";
import { getBrandEarliestRunDate } from "@/lib/postgres-read";
import {
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

	if (lookback !== "all") {
		return { timezone, ...getBoundedLookbackRange(lookback, timezone, { now }) };
	}

	const todayStr = calendarDayInTimezone(timezone, now);
	const earliest = await getBrandEarliestRunDate(brandId);
	// A brand with no runs gets an empty window rather than an open-ended one, so
	// the charts draw a single day of nothing instead of a decade of it.
	if (!earliest) return { timezone, fromDateStr: todayStr, toDateStr: todayStr };

	return { timezone, fromDateStr: calendarDayInTimezone(timezone, new Date(earliest)), toDateStr: todayStr };
}
