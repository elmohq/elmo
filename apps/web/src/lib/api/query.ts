/**
 * The query parameters the routes share. A query value arrives as text, so
 * each schema first reads the text the way the routes always have, and the
 * check after that is what the value is held to.
 */
import { z } from "zod";

export const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const INSTANT_EXAMPLE = "an ISO 8601 timestamp, e.g. 2026-01-01T00:00:00Z";

/** The instant a caller wrote, normalized to UTC, or nothing where it names none. */
export function readInstant(raw: string): string | undefined {
	if (BARE_DATE.test(raw)) return undefined;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * Clamped rather than rejected, as the shared `Limit` parameter documents: the
 * cap is there to bound a runaway query, not to refuse a caller who asked for more.
 */
function clampedTo(max: number, fallback: number) {
	return (raw: unknown): unknown => {
		const value = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
		return Number.isNaN(value) ? fallback : Math.max(1, Math.min(max, value));
	};
}

/** A bounded count, such as a page's length or a top-K list's, clamped into range. */
export function clampedCount(max: number, fallback: number) {
	return z.preprocess(clampedTo(max, fallback), z.int().min(1).max(max)).default(fallback);
}

export const page = z.preprocess(clampedTo(Number.MAX_SAFE_INTEGER, 1), z.int().min(1)).default(1);

export const DEFAULT_LIMIT = 20;

export const limit = clampedCount(100, DEFAULT_LIMIT);

/** Most brands get every row on the first page, and a page stays well inside a response a function can return. */
export const analyticsListLimit = clampedCount(1000, 1000);

/** Any instant `Date` reads, normalized, so the format check holds the caller to nothing new. */
function instant() {
	return z.preprocess(
		(raw) => (typeof raw === "string" ? (readInstant(raw) ?? raw) : raw),
		z.iso.datetime({
			offset: true,
			error: (issue) => {
				if (issue.input === undefined) return `is required, as ${INSTANT_EXAMPLE}`;
				return typeof issue.input === "string" && BARE_DATE.test(issue.input)
					? `must be ${INSTANT_EXAMPLE} — a bare date is not accepted`
					: `must be ${INSTANT_EXAMPLE}`;
			},
		}),
	);
}

export const windowStart = instant();

export const windowEnd = instant();

export const modelFilter = z.string().optional();

export const tagsFilter = z.string().optional();

/** What every analytics endpoint reads: the window and the two filters. */
export const analyticsQuery = z.object({
	start: windowStart,
	end: windowEnd,
	model: modelFilter,
	tags: tagsFilter,
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
