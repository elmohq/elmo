/**
 * The date window every analytics endpoint accepts: explicit `startDate` +
 * `endDate`, which is the spelling `/prompts/{promptId}/snapshot` already
 * takes. The dashboard's relative presets are its own affair — a caller that
 * wants "the last month" can subtract a month.
 *
 * Days are bucketed in UTC and there is no parameter to change that. The
 * dashboard resolves a time zone because it has a browser to read one from; an
 * API request has nothing to infer it from, so a zone would be a number the
 * caller has to supply to make two responses comparable. `/snapshot` shipped
 * without one and is the precedent.
 */
import { ApiError } from "./handler";

export interface AnalyticsWindow {
	startDate: string;
	endDate: string;
	timezone: string;
}

/** What a caller sees of the window: the bounds, with no zone to reason about. */
export function publicRange(window: AnalyticsWindow): { startDate: string; endDate: string } {
	return { startDate: window.startDate, endDate: window.endDate };
}

function isIsoDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	// Rejects rollovers like 2026-13-01, which Date happily accepts.
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function invalid(message: string): never {
	throw new ApiError(400, "Validation Error", message, "validation_error");
}

export function parseAnalyticsWindow(url: URL): AnalyticsWindow {
	const params = url.searchParams;
	const startDate = params.get("startDate");
	const endDate = params.get("endDate");

	if (!startDate || !endDate) {
		invalid("A window is required: both startDate and endDate (YYYY-MM-DD)");
	}
	if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
		invalid("startDate and endDate must be valid dates in YYYY-MM-DD format");
	}
	if (startDate > endDate) {
		invalid("startDate must be before or equal to endDate");
	}
	return { startDate, endDate, timezone: "UTC" };
}

/** The `model` and `tags` filters every analytics endpoint shares. */
export interface AnalyticsFilters {
	model?: string;
	tags?: string;
}

export function parseAnalyticsFilters(url: URL): AnalyticsFilters {
	return {
		model: url.searchParams.get("model") ?? undefined,
		tags: url.searchParams.get("tags") ?? undefined,
	};
}

export function parsePaging(url: URL, defaultLimit = 20): { page: number; limit: number; offset: number } {
	const rawPage = url.searchParams.get("page") ?? "1";
	const rawLimit = url.searchParams.get("limit") ?? String(defaultLimit);
	if (!/^\d+$/.test(rawPage) || Number(rawPage) < 1) invalid("page must be a positive integer");
	if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100) {
		invalid("limit must be an integer between 1 and 100");
	}
	const page = Number(rawPage);
	const limit = Number(rawLimit);
	return { page, limit, offset: (page - 1) * limit };
}
