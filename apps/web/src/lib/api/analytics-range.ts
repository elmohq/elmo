/**
 * Half-open `[start, end)` ISO instants, which is why there is no `timezone`
 * beside them. `/prompts/{promptId}/snapshot` keeps the calendar days it
 * shipped with, being a published contract.
 */
import { bucketStart } from "@workspace/lib/rollups";
import type { AnalyticsWindow } from "@/server/analytics-core";
import { ApiError } from "./handler";
import { instant } from "./query";

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
	const result = instant.safeParse(raw);
	if (!result.success) {
		invalid(`${name} ${result.error.issues.map((issue) => issue.message).join("; ")}`);
	}
	return new Date(result.data).toISOString();
}

// Analytics are aggregated per quarter-hour bucket, which can't be split; flooring
// lets the response echo the window that was actually answered.
function alignToBucket(at: string): string {
	return bucketStart(new Date(at)).toISOString();
}

/** Over plain values, so the MCP tools and the query schema refuse a bad window
 * the same way. */
export function resolveAnalyticsWindow(rawStart: string | undefined, rawEnd: string | undefined): AnalyticsWindow {
	if (!rawStart || !rawEnd) {
		invalid("A window is required: both start and end, as ISO 8601 timestamps");
	}
	const requestedStart = parseInstant("start", rawStart);
	const requestedEnd = parseInstant("end", rawEnd);
	const start = alignToBucket(requestedStart);
	const end = alignToBucket(requestedEnd);
	// Must run after alignment so a sub-bucket window is refused, not answered empty.
	if (start >= end) {
		invalid(
			requestedStart < requestedEnd
				? "start and end fall in the same quarter-hour bucket, which leaves an empty window"
				: "start must be before end",
		);
	}
	return { from: start, to: end, timezone: BUCKET_ZONE };
}

export type { AnalyticsFilters } from "@/server/analytics-core";
