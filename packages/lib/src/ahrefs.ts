/**
 * Ahrefs Domain Rating client.
 *
 * Uses the free, key-less public endpoint:
 *   GET https://api.ahrefs.com/v3/public/domain-rating-free?target=<domain>&output=json
 *   -> { "domain_rating": { "domain_rating": <float 0-100> } }
 *
 * One domain per request. No authentication is required. This client is
 * intentionally "dumb": it takes an already-normalized bare domain and does no
 * caching — caching/coordination lives in the loader that calls it
 * (apps/web/src/lib/domain-rating-cache.ts).
 */

const ENDPOINT = "https://api.ahrefs.com/v3/public/domain-rating-free";

export type DomainRatingResult = { status: "ok"; rating: number } | { status: "not_found"; rating: null };

/**
 * Thrown for transient failures (429 / 5xx) where the same domain is worth
 * retrying on a later pass. The caller should back off when it sees this.
 */
export class AhrefsRetryableError extends Error {
	readonly httpStatus: number;
	constructor(httpStatus: number, message: string) {
		super(message);
		this.name = "AhrefsRetryableError";
		this.httpStatus = httpStatus;
	}
}

/**
 * Parse the free domain-rating response body. Returns the numeric rating, or
 * null when the body has no usable rating. Pure — split out for unit testing.
 */
export function parseDomainRatingResponse(json: unknown): number | null {
	if (!json || typeof json !== "object") return null;
	const outer = (json as { domain_rating?: unknown }).domain_rating;
	if (!outer || typeof outer !== "object") return null;
	const rating = (outer as { domain_rating?: unknown }).domain_rating;
	if (typeof rating !== "number" || Number.isNaN(rating)) return null;
	return rating;
}

/**
 * Fetch the Domain Rating for a single already-normalized domain.
 *
 * - Resolves to { status: "ok", rating } on success.
 * - Resolves to { status: "not_found", rating: null } on a 4xx for the target
 *   (invalid/unknown domain) or a body without a usable rating. These are
 *   cached so we don't refetch every poll (with a short retry window upstream).
 * - Throws AhrefsRetryableError on 429 / 5xx so the caller can back off.
 */
export async function fetchDomainRating(domain: string, init?: { signal?: AbortSignal }): Promise<DomainRatingResult> {
	const url = `${ENDPOINT}?target=${encodeURIComponent(domain)}&output=json`;
	const res = await fetch(url, {
		method: "GET",
		headers: { Accept: "application/json" },
		signal: init?.signal,
	});

	if (res.status === 429 || res.status >= 500) {
		throw new AhrefsRetryableError(res.status, `Ahrefs DR request failed (${res.status}) for ${domain}`);
	}

	if (!res.ok) {
		// 4xx for this specific target — terminal for now (refetched after a short TTL).
		return { status: "not_found", rating: null };
	}

	const json = await res.json().catch(() => null);
	const rating = parseDomainRatingResponse(json);
	return rating === null ? { status: "not_found", rating: null } : { status: "ok", rating };
}
