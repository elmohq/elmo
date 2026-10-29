import { parseModelFilter } from "@workspace/config/model-filter";
import type { AnalyticsScope } from "@/lib/analytics-sql";
import type { BrandStore, StoreRunKeys } from "@/lib/brand-data/store";

const isCalendarDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const dayFormats = new Map<string, Intl.DateTimeFormat>();
function dayFormat(timezone: string) {
	let format = dayFormats.get(timezone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-CA", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		dayFormats.set(timezone, format);
	}
	return format;
}

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

const localDays = new Map<string, Map<number, string>>();
/** The calendar day a bucket (minutes since the epoch) falls on in `timezone`. */
export function localDay(bucketMinutes: number, timezone: string): string {
	let cache = localDays.get(timezone);
	if (!cache) {
		cache = new Map();
		localDays.set(timezone, cache);
	}
	let day = cache.get(bucketMinutes);
	if (day === undefined) {
		day = dayFormat(timezone).format(new Date(bucketMinutes * 60_000));
		cache.set(bucketMinutes, day);
	}
	return day;
}

export function localDayOfMs(ms: number, timezone: string): string {
	return dayFormat(timezone).format(new Date(ms));
}

/** Minutes bounds `[start, end)` of the scope's window, null for unbounded. */
export function windowMinutes(scope: AnalyticsScope): { start: number; end: number } {
	const start = scope.from
		? (isCalendarDay(scope.from) ? zonedMidnight(scope.from, scope.timezone) : Date.parse(scope.from)) / 60_000
		: Number.NEGATIVE_INFINITY;
	const end = scope.to
		? (isCalendarDay(scope.to) ? zonedMidnight(nextDay(scope.to), scope.timezone) : Date.parse(scope.to)) / 60_000
		: Number.POSITIVE_INFINITY;
	return { start, end };
}

function lowerBound(values: Int32Array, length: number, target: number) {
	let lo = 0;
	let hi = length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (values[mid] < target) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** Mirrors `scopeFilter`: the rows of a table the scope covers, by index. */
export function scopeRows(store: BrandStore, table: StoreRunKeys, scope: AnalyticsScope): number[] {
	if (scope.brandId !== store.bundle.brandId) return [];
	const { start, end } = windowMinutes(scope);
	const first = Number.isFinite(start) ? lowerBound(table.bucket, table.length, Math.ceil(start)) : 0;
	const last = Number.isFinite(end) ? lowerBound(table.bucket, table.length, Math.ceil(end)) : table.length;

	let promptAllowed: Uint8Array | null = null;
	const { promptIds, excludedPromptIds } = scope;
	if (promptIds?.length !== 0 && excludedPromptIds) {
		if (excludedPromptIds.length > 0) {
			promptAllowed = new Uint8Array(store.bundle.prompts.length).fill(1);
			for (const id of excludedPromptIds) {
				const index = store.promptIndex.get(id);
				if (index !== undefined) promptAllowed[index] = 0;
			}
		}
	} else if (promptIds) {
		promptAllowed = new Uint8Array(store.bundle.prompts.length);
		for (const id of promptIds) {
			const index = store.promptIndex.get(id);
			if (index !== undefined) promptAllowed[index] = 1;
		}
	}

	const target = scope.model ? parseModelFilter(scope.model) : null;
	const targetModel = target ? store.bundle.dicts.models.indexOf(target.model) : -1;
	if (target && (targetModel < 0 || (target.premium && store.apiProviders.size === 0))) return [];
	const web = scope.webSearchEnabled;

	const rows: number[] = [];
	for (let i = first; i < last; i++) {
		if (promptAllowed && !promptAllowed[table.prompt[i]]) continue;
		if (target) {
			if (table.model[i] !== targetModel) continue;
			if (store.apiProviders.size > 0) {
				const grounded = table.web[i] === 1 && store.apiProviders.has(table.provider[i]);
				if (grounded !== target.premium) continue;
			}
		}
		if (web !== undefined && (table.web[i] === 1) !== web) continue;
		rows.push(i);
	}
	return rows;
}
