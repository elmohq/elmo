import type { AnalyticsScope } from "@/lib/analytics-sql";

const isCalendarDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const partsFormats = new Map<string, Intl.DateTimeFormat>();
/** How far `timezone` is ahead of UTC at `ms`, in ms. */
function offsetAt(ms: number, timezone: string): number {
	let format = partsFormats.get(timezone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		partsFormats.set(timezone, format);
	}
	const parts = Object.fromEntries(format.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
	const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
	return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant a calendar day starts in `timezone`, as Postgres reads `day::timestamp AT TIME ZONE tz`. */
export function zonedMidnight(day: string, timezone: string): number {
	const [y, m, d] = day.split("-").map(Number);
	const wall = Date.UTC(y, m - 1, d);
	let instant = wall - offsetAt(wall, timezone);
	instant = wall - offsetAt(instant, timezone);
	return instant;
}

const nextDay = (day: string) => {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
};

export function windowMinutes(scope: AnalyticsScope): { start: number; end: number } {
	const start = scope.from
		? (isCalendarDay(scope.from) ? zonedMidnight(scope.from, scope.timezone) : Date.parse(scope.from)) / 60_000
		: Number.NEGATIVE_INFINITY;
	const end = scope.to
		? (isCalendarDay(scope.to) ? zonedMidnight(nextDay(scope.to), scope.timezone) : Date.parse(scope.to)) / 60_000
		: Number.POSITIVE_INFINITY;
	return { start, end };
}
