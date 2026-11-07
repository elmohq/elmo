/**
 * The query parameters the routes share. A query value arrives as text, so
 * each schema first reads the text the way the routes always have, and the
 * check after that is what the value is held to.
 */
import { z } from "zod";

const INSTANT_EXAMPLE = "an ISO 8601 timestamp with an offset, e.g. 2026-01-01T00:00:00Z";

/**
 * Clamped rather than rejected, as the shared `Limit` parameter documents: the
 * cap is there to bound a runaway query, not to refuse a caller who asked for more.
 */
export function clampedCount(max: number, fallback: number) {
	return z
		.string()
		.optional()
		.transform((raw) => {
			const value = Number.parseInt(raw ?? "", 10);
			return Number.isNaN(value) ? fallback : Math.max(1, Math.min(max, value));
		});
}

export const page = clampedCount(Number.MAX_SAFE_INTEGER, 1);

export const DEFAULT_LIMIT = 20;

const limit = clampedCount(100, DEFAULT_LIMIT);

/** Most brands get every row on the first page, and a page stays well inside a response a function can return. */
const analyticsListLimit = clampedCount(1000, 1000);

/** RFC 3339, as the spec's `format: date-time` says: without an offset, `Date` would read the server's local time. */
export const instant = z.iso.datetime({
	offset: true,
	error: (issue) => {
		if (issue.input === undefined) return `is required, as ${INSTANT_EXAMPLE}`;
		return typeof issue.input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(issue.input)
			? `must be ${INSTANT_EXAMPLE} — a bare date is not accepted`
			: `must be ${INSTANT_EXAMPLE}`;
	},
});

/** What every analytics endpoint reads: the window and the two filters. */
export const analyticsQuery = z.object({
	start: instant,
	end: instant,
	model: z.string().optional(),
	tags: z.string().optional(),
});

/** What every list reads to page. */
export const paging = { page, limit };

/** What the analytics lists read to page. */
export const analyticsListPaging = { page, limit: analyticsListLimit };

export function offsetOf({ page, limit }: { page: number; limit: number }): number {
	return (page - 1) * limit;
}

/** The `pagination` a list answers with. */
export function paginationOf({ page, limit }: { page: number; limit: number }, total: number) {
	return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
