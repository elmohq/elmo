/**
 * Which market the scraped surfaces are measured from.
 *
 * Every scraped provider asked Google, Copilot and the consumer chat products
 * as if from the United States, with no way to say otherwise: the location code
 * and country were hardcoded constants. A deployment measuring a non-US brand
 * was therefore judging it on answers its audience never sees.
 *
 * These are DEPLOYMENT-WIDE defaults, deliberately. Per-target localization is
 * a different thing, tracked in #13 (location-based prompts) and #525
 * (lang/market view), and is not pre-empted here — support differs by surface
 * and by underlying model, which is why SCRAPE_TARGETS still says nothing about
 * country.
 *
 * Every getter falls back to the value that was previously hardcoded, so an
 * existing deployment that sets none of these behaves exactly as before.
 *
 * Server-only: `process` is not defined in browser bundles.
 */

const env = (name: string): string | undefined => (typeof process !== "undefined" ? process.env[name] : undefined);

/** ISO 3166-1 alpha-2, or undefined if the value is not one. */
function isoAlpha2(raw: string | undefined): string | undefined {
	if (!raw) return undefined;
	const trimmed = raw.trim();
	return /^[A-Za-z]{2}$/.test(trimmed) ? trimmed : undefined;
}

/** DataForSEO location code when DATAFORSEO_LOCATION_CODE is unset or invalid. */
export const DFS_LOCATION_CODE_FALLBACK = 2840; // United States

/**
 * DataForSEO location code for every scraped SERP surface. Codes are listed at
 * https://docs.dataforseo.com/v3/serp/google/locations/ — 2826 United Kingdom,
 * 2276 Germany, 2250 France.
 */
export function getDfsLocationCode(): number {
	const raw = env("DATAFORSEO_LOCATION_CODE");
	if (!raw) return DFS_LOCATION_CODE_FALLBACK;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) return DFS_LOCATION_CODE_FALLBACK;
	return parsed;
}

/** Country Cloro localizes answers to when CLORO_COUNTRY is unset or invalid. */
export const CLORO_COUNTRY_FALLBACK = "US";

/** Cloro takes an upper-case alpha-2. */
export function getCloroCountry(): string {
	return isoAlpha2(env("CLORO_COUNTRY"))?.toUpperCase() ?? CLORO_COUNTRY_FALLBACK;
}

/** `gl` on BrightData's Google SERP when BRIGHTDATA_SERP_COUNTRY is unset or invalid. */
export const BRIGHTDATA_SERP_COUNTRY_FALLBACK = "us";

/** Google's `gl` param takes a lower-case alpha-2. */
export function getBrightdataSerpCountry(): string {
	return isoAlpha2(env("BRIGHTDATA_SERP_COUNTRY"))?.toLowerCase() ?? BRIGHTDATA_SERP_COUNTRY_FALLBACK;
}
