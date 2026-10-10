import { z } from "zod";

/**
 * The countries a prompt can be run from. Each prompt belongs to exactly one,
 * and every provider that can localize translates the code into its own
 * parameter (a Google `gl`, a DataForSEO location code, an approximate user
 * location for a model's web search tool).
 *
 * Deliberately a curated list rather than all of ISO 3166: providers each
 * cover a different subset, and every entry here is one the broad-coverage
 * providers serve. Which targets can answer from a given country is the
 * provider's call (see `Provider.localizes`).
 */

/** Every prompt that predates countries ran from here, and new ones start here. */
export const DEFAULT_COUNTRY = "US";

export interface Country {
	/** ISO 3166-1 alpha-2, which is what's stored and what the API accepts. */
	code: string;
	/** English short name, as the providers that take a name expect it. */
	name: string;
	/** ISO 3166-1 numeric, the basis of Google Ads geotarget ids. */
	numeric: number;
}

export const COUNTRIES: readonly Country[] = [
	{ code: "US", name: "United States", numeric: 840 },
	{ code: "GB", name: "United Kingdom", numeric: 826 },
	{ code: "CA", name: "Canada", numeric: 124 },
	{ code: "AU", name: "Australia", numeric: 36 },
	{ code: "NZ", name: "New Zealand", numeric: 554 },
	{ code: "IE", name: "Ireland", numeric: 372 },
	{ code: "DE", name: "Germany", numeric: 276 },
	{ code: "AT", name: "Austria", numeric: 40 },
	{ code: "CH", name: "Switzerland", numeric: 756 },
	{ code: "FR", name: "France", numeric: 250 },
	{ code: "BE", name: "Belgium", numeric: 56 },
	{ code: "NL", name: "Netherlands", numeric: 528 },
	{ code: "LU", name: "Luxembourg", numeric: 442 },
	{ code: "ES", name: "Spain", numeric: 724 },
	{ code: "PT", name: "Portugal", numeric: 620 },
	{ code: "IT", name: "Italy", numeric: 380 },
	{ code: "SE", name: "Sweden", numeric: 752 },
	{ code: "NO", name: "Norway", numeric: 578 },
	{ code: "DK", name: "Denmark", numeric: 208 },
	{ code: "FI", name: "Finland", numeric: 246 },
	{ code: "PL", name: "Poland", numeric: 616 },
	{ code: "CZ", name: "Czech Republic", numeric: 203 },
	{ code: "GR", name: "Greece", numeric: 300 },
	{ code: "RO", name: "Romania", numeric: 642 },
	{ code: "HU", name: "Hungary", numeric: 348 },
	{ code: "UA", name: "Ukraine", numeric: 804 },
	{ code: "TR", name: "Turkey", numeric: 792 },
	{ code: "IL", name: "Israel", numeric: 376 },
	{ code: "AE", name: "United Arab Emirates", numeric: 784 },
	{ code: "SA", name: "Saudi Arabia", numeric: 682 },
	{ code: "EG", name: "Egypt", numeric: 818 },
	{ code: "ZA", name: "South Africa", numeric: 710 },
	{ code: "NG", name: "Nigeria", numeric: 566 },
	{ code: "KE", name: "Kenya", numeric: 404 },
	{ code: "IN", name: "India", numeric: 356 },
	{ code: "SG", name: "Singapore", numeric: 702 },
	{ code: "MY", name: "Malaysia", numeric: 458 },
	{ code: "ID", name: "Indonesia", numeric: 360 },
	{ code: "PH", name: "Philippines", numeric: 608 },
	{ code: "TH", name: "Thailand", numeric: 764 },
	{ code: "VN", name: "Vietnam", numeric: 704 },
	{ code: "JP", name: "Japan", numeric: 392 },
	{ code: "KR", name: "South Korea", numeric: 410 },
	{ code: "TW", name: "Taiwan", numeric: 158 },
	{ code: "HK", name: "Hong Kong", numeric: 344 },
	{ code: "MX", name: "Mexico", numeric: 484 },
	{ code: "BR", name: "Brazil", numeric: 76 },
	{ code: "AR", name: "Argentina", numeric: 32 },
	{ code: "CL", name: "Chile", numeric: 152 },
	{ code: "CO", name: "Colombia", numeric: 170 },
	{ code: "PE", name: "Peru", numeric: 604 },
];

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

/** Case-insensitive, since the API and hand-edited links send either. */
export function normalizeCountryCode(raw: string): string | null {
	const code = raw.trim().toUpperCase();
	return BY_CODE.has(code) ? code : null;
}

export function getCountry(code: string): Country {
	const country = BY_CODE.get(code);
	if (!country) throw new Error(`Unsupported country "${code}"`);
	return country;
}

export function countryName(code: string): string {
	return BY_CODE.get(code)?.name ?? code;
}

/**
 * A comma-separated country filter from a URL or API query, keeping only codes
 * this list knows. An unknown code is dropped rather than rejected so a stale
 * shared link still opens on the countries it can still name.
 */
export function parseCountryFilter(raw: string | undefined | null): string[] {
	if (!raw) return [];
	const codes = raw.split(",").map(normalizeCountryCode);
	return [...new Set(codes.filter((code): code is string => code !== null))];
}

/** A country code from user input: either case in, the stored uppercase code out. */
export const countryCodeSchema = z.string().transform((raw, ctx) => {
	const code = normalizeCountryCode(raw);
	if (code) return code;
	ctx.addIssue({ code: "custom", message: `Unsupported country "${raw}". Use an ISO 3166-1 alpha-2 code, e.g. "GB".` });
	return z.NEVER;
});
