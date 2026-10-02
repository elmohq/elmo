import { z } from "zod";

export const LOOKBACK_PERIODS = ["1w", "1m", "3m", "6m", "1y", "all"] as const;
export type LookbackPreset = (typeof LOOKBACK_PERIODS)[number];

/** A custom range rides in the same `lookback` value as the presets, so every
 *  URL param, query key and server fn that already carries a lookback carries
 *  it unchanged. Both ends are inclusive calendar dates in the viewer's
 *  timezone. */
export type CustomLookback = `${string}..${string}`;
export type LookbackPeriod = LookbackPreset | CustomLookback;

export interface DateRange {
	from: string;
	to: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOM_SEPARATOR = "..";

function isCalendarDate(value: string): boolean {
	if (!DATE_PATTERN.test(value)) return false;
	// Round-trip rejects dates like 2026-02-30 that `Date` would roll over.
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isLookbackPreset(value: unknown): value is LookbackPreset {
	return typeof value === "string" && (LOOKBACK_PERIODS as readonly string[]).includes(value);
}

export function parseCustomLookback(value: string | null | undefined): DateRange | null {
	if (!value) return null;
	const parts = value.split(CUSTOM_SEPARATOR);
	if (parts.length !== 2) return null;
	const [from, to] = parts;
	if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) return null;
	return { from, to };
}

export function formatCustomLookback(range: DateRange): CustomLookback {
	return `${range.from}${CUSTOM_SEPARATOR}${range.to}`;
}

export function isLookbackPeriod(value: unknown): value is LookbackPeriod {
	return isLookbackPreset(value) || (typeof value === "string" && parseCustomLookback(value) !== null);
}

export const lookbackSchema = z.custom<LookbackPeriod>(isLookbackPeriod, {
	message: "Expected a lookback preset or a YYYY-MM-DD..YYYY-MM-DD range",
});

export const calendarDateSchema = z.string().refine(isCalendarDate, "Expected a YYYY-MM-DD date");

/** Inclusive number of calendar days in a range. */
export function daysInRange(range: DateRange): number {
	const ms = Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`);
	return Math.round(ms / 86_400_000) + 1;
}
