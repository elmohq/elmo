/**
 * The time window every `/api/v1` analytics endpoint takes.
 *
 * `start` and `end` are ISO 8601 timestamps and the window is half-open,
 * `[start, end)`. A timestamp names an instant and carries its own offset, so
 * there is nothing else for a caller to send and nothing to agree on out of
 * band — which is why there is no `timezone` parameter beside it.
 *
 * `/prompts/{promptId}/snapshot` keeps the `startDate`/`endDate` calendar days
 * it shipped with. That is a published contract, so it stays exactly as it is;
 * these endpoints are new and take the spelling that doesn't need a second
 * parameter to mean anything.
 */
import type { AnalyticsWindow } from "@/server/analytics-core";
import { ApiError } from "./handler";

/**
 * Days are labelled in UTC and there is no parameter to change that. A bucket
 * label is the one part of the answer a caller can recompute from the runs it
 * already has, so it isn't worth a value everyone has to keep sending.
 */
const BUCKET_ZONE = "UTC";

/** What a caller sees of the window: the two instants it asked with, in UTC. */
export function publicRange(window: AnalyticsWindow): { start: string; end: string } {
	return { start: window.from, end: window.to };
}

function invalid(message: string): never {
	throw new ApiError(400, "Validation Error", message, "validation_error");
}

/**
 * A bare `YYYY-MM-DD` is rejected rather than read as midnight UTC. It is the
 * legacy endpoint's spelling, it means a *local* day there, and accepting it
 * here would put the same string in two endpoints meaning two things.
 */
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

export function parseAnalyticsWindow(url: URL): AnalyticsWindow {
	const params = url.searchParams;
	const rawStart = params.get("start");
	const rawEnd = params.get("end");

	if (!rawStart || !rawEnd) {
		invalid("A window is required: both start and end, as ISO 8601 timestamps");
	}
	const start = parseInstant("start", rawStart);
	const end = parseInstant("end", rawEnd);
	// The window is half-open, so an empty one is a request that can only ever
	// answer with nothing — worth reporting rather than serving.
	if (start >= end) {
		invalid("start must be before end");
	}
	return { from: start, to: end, timezone: BUCKET_ZONE };
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
