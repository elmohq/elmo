/**
 * Shared query-parameter parsing for `/api/v1` analytics endpoints.
 *
 * Every analytics endpoint takes the same date window: `from` and `to`
 * (inclusive, `YYYY-MM-DD`, required) plus an optional IANA `timezone` the day
 * buckets are computed in (default UTC). Centralizing it keeps the convention
 * identical across endpoints and the validation tested in one place.
 */
import { ApiError } from "./handler";

export interface DateRange {
	from: string;
	to: string;
	timezone: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
	if (!DATE_RE.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return false;
	// Reject values the Date constructor silently rolls over (e.g. 2026-13-01
	// becomes 2027-01-01), which the regex alone would let through.
	return d.toISOString().slice(0, 10) === value;
}

/**
 * Parse and validate the shared analytics date-range params from a request's
 * query string. Throws `ApiError(400, ...)` on any problem so the handler's
 * uniform error envelope applies.
 */
export function parseDateRange(searchParams: URLSearchParams): DateRange {
	const from = searchParams.get("from");
	const to = searchParams.get("to");

	if (!from || !to) {
		throw new ApiError(400, "Validation Error", "from and to query parameters are required (YYYY-MM-DD format)");
	}
	if (!isValidDate(from) || !isValidDate(to)) {
		throw new ApiError(400, "Validation Error", "from and to must be valid dates in YYYY-MM-DD format");
	}
	if (from > to) {
		throw new ApiError(400, "Validation Error", "from must be before or equal to to");
	}

	return { from, to, timezone: searchParams.get("timezone") || "UTC" };
}
