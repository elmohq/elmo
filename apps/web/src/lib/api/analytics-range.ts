/**
 * Half-open `[start, end)` ISO instants, which is why there is no `timezone`
 * beside them. `/prompts/{promptId}/snapshot` keeps the calendar days it
 * shipped with, being a published contract.
 */
import { bucketStart } from "@workspace/lib/rollups";
import type { AnalyticsWindow } from "@/server/analytics-core";
import { ApiError } from "./handler";

const BUCKET_ZONE = "UTC";

export function publicRange(window: AnalyticsWindow): { start: string; end: string } {
	return { start: window.from, end: window.to };
}

function invalid(message: string): never {
	throw new ApiError(400, "Validation Error", message, "validation_error");
}

/** Rejected rather than read as midnight UTC: it means a local day on the
 * legacy endpoint, and one string cannot mean two things. */
function parseInstant(name: string, raw: string): string {
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		invalid(`${name} must be an ISO 8601 timestamp, e.g. 2026-01-01T00:00:00Z — a bare date is not accepted`);
	}
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) {
		invalid(`${name} must be an ISO 8601 timestamp, e.g. 2026-01-01T00:00:00Z`);
	}
	return parsed.toISOString();
}

/** Analytics are aggregated per half-hour bucket, and a bucket cannot be split
 * at 10:17. Flooring both bounds is what lets the response echo the window that
 * was actually answered. */
function alignToBucket(instant: string): string {
	return bucketStart(new Date(instant)).toISOString();
}

/** Over plain values, so the MCP tools and the URL parser refuse a bad window
 * the same way. */
export function resolveAnalyticsWindow(rawStart: string | null, rawEnd: string | null): AnalyticsWindow {
	if (!rawStart || !rawEnd) {
		invalid("A window is required: both start and end, as ISO 8601 timestamps");
	}
	const requestedStart = parseInstant("start", rawStart);
	const requestedEnd = parseInstant("end", rawEnd);
	const start = alignToBucket(requestedStart);
	const end = alignToBucket(requestedEnd);
	// Checked after alignment, so a window narrower than one bucket is refused
	// rather than answered as empty — and says why.
	if (start >= end) {
		invalid(
			requestedStart < requestedEnd
				? "start and end fall in the same half-hour bucket, which leaves an empty window"
				: "start must be before end",
		);
	}
	return { from: start, to: end, timezone: BUCKET_ZONE };
}

export function parseAnalyticsWindow(url: URL): AnalyticsWindow {
	return resolveAnalyticsWindow(url.searchParams.get("start"), url.searchParams.get("end"));
}

export type { AnalyticsFilters } from "@/server/analytics-core";

export function parseAnalyticsFilters(url: URL): { model?: string; tags?: string } {
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

/**
 * Clamped rather than rejected, unlike `parsePaging`: on the list endpoints
 * that predate the spec the cap is there to bound a runaway query, not to
 * change what an existing caller gets back.
 */
export function clampedPaging(
	searchParams: URLSearchParams,
	maxLimit = 100,
): { page: number; limit: number; offset: number } {
	const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
	const limit = Math.max(1, Math.min(maxLimit, parseInt(searchParams.get("limit") || "20")));
	return { page, limit, offset: (page - 1) * limit };
}
