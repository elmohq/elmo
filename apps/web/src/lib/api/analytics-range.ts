/**
 * The date window every analytics endpoint accepts.
 *
 * Two spellings, one meaning: explicit `startDate` + `endDate`, or the
 * `lookback` shorthand the dashboard is built on. Exactly one form per request
 * — supplying both is a `400` rather than a silent precedence rule nobody can
 * remember. Both resolve to the same concrete bounds before anything queries.
 */
import type { LookbackPeriod } from "@/lib/chart-utils";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";
import { ApiError } from "./handler";

export interface AnalyticsWindow {
	startDate: string;
	endDate: string;
	timezone: string;
}

const LOOKBACKS: LookbackPeriod[] = ["1w", "1m", "3m", "6m", "1y", "all"];

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
	const lookback = params.get("lookback");
	const requestedTimezone = params.get("timezone");
	if (requestedTimezone) {
		try {
			new Intl.DateTimeFormat("en-US", { timeZone: requestedTimezone }).format();
		} catch {
			invalid("timezone must be a valid IANA time zone");
		}
	}
	const timezone = resolveTimezone(requestedTimezone ?? undefined, "UTC");

	const hasExplicit = startDate !== null || endDate !== null;
	if (lookback !== null && hasExplicit) {
		invalid("Provide either lookback or startDate and endDate, not both");
	}

	if (lookback !== null) {
		if (!LOOKBACKS.includes(lookback as LookbackPeriod)) {
			invalid(`lookback must be one of ${LOOKBACKS.join(", ")}`);
		}
		// `allStrategy: "1y"` caps the open-ended window the same way the
		// dashboard does, so the API can't quietly return a wider range.
		const range = getTimezoneLookbackRange(lookback as LookbackPeriod, timezone, { allStrategy: "1y" }) as {
			fromDateStr: string;
			toDateStr: string;
		};
		return { startDate: range.fromDateStr, endDate: range.toDateStr, timezone };
	}

	if (!startDate || !endDate) {
		invalid("A window is required: either lookback, or both startDate and endDate (YYYY-MM-DD)");
	}
	if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
		invalid("startDate and endDate must be valid dates in YYYY-MM-DD format");
	}
	if (startDate > endDate) {
		invalid("startDate must be before or equal to endDate");
	}
	return { startDate, endDate, timezone };
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

export function paginate<T>(rows: T[], page: number, limit: number) {
	const total = rows.length;
	return {
		data: rows.slice((page - 1) * limit, page * limit),
		pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
}
