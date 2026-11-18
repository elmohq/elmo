/**
 * A market is where a prompt is asked from and the language it is asked in.
 * Both lists are curated: every country is one the broad-coverage scraping
 * providers serve, and every language is one the Google surfaces accept as an
 * interface language and current models translate well.
 */
import { z } from "zod";

export interface Market {
	/** ISO 3166-1 alpha-2. */
	country: string;
	/** ISO 639-1. Regional forms (Brazilian Portuguese, Traditional Chinese) follow from the country. */
	language: string;
}

/** What every prompt ran as before markets, and what a new brand starts with. */
export const DEFAULT_MARKET: Market = { country: "US", language: "en" };

interface Country {
	code: string;
	name: string;
	/** ISO 3166-1 numeric, which Google Ads geotarget ids are built from. */
	numeric: number;
	/** Languages besides English worth offering here. */
	languages: readonly string[];
}

export const COUNTRIES: readonly Country[] = [
	{ code: "US", name: "United States", numeric: 840, languages: ["es"] },
	{ code: "GB", name: "United Kingdom", numeric: 826, languages: [] },
	{ code: "CA", name: "Canada", numeric: 124, languages: ["fr"] },
	{ code: "AU", name: "Australia", numeric: 36, languages: [] },
	{ code: "NZ", name: "New Zealand", numeric: 554, languages: [] },
	{ code: "IE", name: "Ireland", numeric: 372, languages: [] },
	{ code: "DE", name: "Germany", numeric: 276, languages: ["de"] },
	{ code: "AT", name: "Austria", numeric: 40, languages: ["de"] },
	{ code: "CH", name: "Switzerland", numeric: 756, languages: ["de", "fr", "it"] },
	{ code: "FR", name: "France", numeric: 250, languages: ["fr"] },
	{ code: "BE", name: "Belgium", numeric: 56, languages: ["nl", "fr"] },
	{ code: "NL", name: "Netherlands", numeric: 528, languages: ["nl"] },
	{ code: "LU", name: "Luxembourg", numeric: 442, languages: ["fr", "de"] },
	{ code: "ES", name: "Spain", numeric: 724, languages: ["es"] },
	{ code: "PT", name: "Portugal", numeric: 620, languages: ["pt"] },
	{ code: "IT", name: "Italy", numeric: 380, languages: ["it"] },
	{ code: "GR", name: "Greece", numeric: 300, languages: ["el"] },
	{ code: "CY", name: "Cyprus", numeric: 196, languages: ["el"] },
	{ code: "MT", name: "Malta", numeric: 470, languages: [] },
	{ code: "SE", name: "Sweden", numeric: 752, languages: ["sv"] },
	{ code: "NO", name: "Norway", numeric: 578, languages: ["no"] },
	{ code: "DK", name: "Denmark", numeric: 208, languages: ["da"] },
	{ code: "FI", name: "Finland", numeric: 246, languages: ["fi"] },
	{ code: "PL", name: "Poland", numeric: 616, languages: ["pl"] },
	{ code: "CZ", name: "Czech Republic", numeric: 203, languages: ["cs"] },
	{ code: "SK", name: "Slovakia", numeric: 703, languages: ["sk"] },
	{ code: "HU", name: "Hungary", numeric: 348, languages: ["hu"] },
	{ code: "RO", name: "Romania", numeric: 642, languages: ["ro"] },
	{ code: "BG", name: "Bulgaria", numeric: 100, languages: ["bg"] },
	{ code: "HR", name: "Croatia", numeric: 191, languages: ["hr"] },
	{ code: "RS", name: "Serbia", numeric: 688, languages: ["sr"] },
	{ code: "LT", name: "Lithuania", numeric: 440, languages: ["lt"] },
	{ code: "UA", name: "Ukraine", numeric: 804, languages: ["uk"] },
	{ code: "TR", name: "Turkey", numeric: 792, languages: ["tr"] },
	{ code: "IL", name: "Israel", numeric: 376, languages: ["he"] },
	{ code: "AE", name: "United Arab Emirates", numeric: 784, languages: ["ar"] },
	{ code: "SA", name: "Saudi Arabia", numeric: 682, languages: ["ar"] },
	{ code: "QA", name: "Qatar", numeric: 634, languages: ["ar"] },
	{ code: "KW", name: "Kuwait", numeric: 414, languages: ["ar"] },
	{ code: "EG", name: "Egypt", numeric: 818, languages: ["ar"] },
	{ code: "MA", name: "Morocco", numeric: 504, languages: ["ar", "fr"] },
	{ code: "ZA", name: "South Africa", numeric: 710, languages: [] },
	{ code: "NG", name: "Nigeria", numeric: 566, languages: [] },
	{ code: "KE", name: "Kenya", numeric: 404, languages: [] },
	{ code: "IN", name: "India", numeric: 356, languages: ["hi"] },
	{ code: "SG", name: "Singapore", numeric: 702, languages: ["zh", "ms"] },
	{ code: "MY", name: "Malaysia", numeric: 458, languages: ["ms"] },
	{ code: "ID", name: "Indonesia", numeric: 360, languages: ["id"] },
	{ code: "PH", name: "Philippines", numeric: 608, languages: [] },
	{ code: "TH", name: "Thailand", numeric: 764, languages: ["th"] },
	{ code: "VN", name: "Vietnam", numeric: 704, languages: ["vi"] },
	{ code: "JP", name: "Japan", numeric: 392, languages: ["ja"] },
	{ code: "KR", name: "South Korea", numeric: 410, languages: ["ko"] },
	{ code: "TW", name: "Taiwan", numeric: 158, languages: ["zh"] },
	{ code: "HK", name: "Hong Kong", numeric: 344, languages: ["zh"] },
	{ code: "MX", name: "Mexico", numeric: 484, languages: ["es"] },
	{ code: "BR", name: "Brazil", numeric: 76, languages: ["pt"] },
	{ code: "AR", name: "Argentina", numeric: 32, languages: ["es"] },
	{ code: "CL", name: "Chile", numeric: 152, languages: ["es"] },
	{ code: "CO", name: "Colombia", numeric: 170, languages: ["es"] },
	{ code: "PE", name: "Peru", numeric: 604, languages: ["es"] },
];

export const LANGUAGES: readonly { code: string; name: string }[] = [
	{ code: "en", name: "English" },
	{ code: "es", name: "Spanish" },
	{ code: "fr", name: "French" },
	{ code: "de", name: "German" },
	{ code: "it", name: "Italian" },
	{ code: "nl", name: "Dutch" },
	{ code: "pt", name: "Portuguese" },
	{ code: "sv", name: "Swedish" },
	{ code: "da", name: "Danish" },
	{ code: "no", name: "Norwegian" },
	{ code: "fi", name: "Finnish" },
	{ code: "pl", name: "Polish" },
	{ code: "cs", name: "Czech" },
	{ code: "sk", name: "Slovak" },
	{ code: "hu", name: "Hungarian" },
	{ code: "ro", name: "Romanian" },
	{ code: "bg", name: "Bulgarian" },
	{ code: "hr", name: "Croatian" },
	{ code: "sr", name: "Serbian" },
	{ code: "lt", name: "Lithuanian" },
	{ code: "el", name: "Greek" },
	{ code: "tr", name: "Turkish" },
	{ code: "uk", name: "Ukrainian" },
	{ code: "ar", name: "Arabic" },
	{ code: "he", name: "Hebrew" },
	{ code: "hi", name: "Hindi" },
	{ code: "id", name: "Indonesian" },
	{ code: "ms", name: "Malay" },
	{ code: "th", name: "Thai" },
	{ code: "vi", name: "Vietnamese" },
	{ code: "ja", name: "Japanese" },
	{ code: "ko", name: "Korean" },
	{ code: "zh", name: "Chinese" },
];

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));
const LANGUAGE_BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

/** Either case in, the stored code out; null for a country outside the list. */
export function normalizeCountry(raw: string): string | null {
	const code = raw.trim().toUpperCase();
	return COUNTRY_BY_CODE.has(code) ? code : null;
}

export function normalizeLanguage(raw: string): string | null {
	const code = raw.trim().toLowerCase();
	return LANGUAGE_BY_CODE.has(code) ? code : null;
}

export function countryName(code: string): string {
	return COUNTRY_BY_CODE.get(code)?.name ?? code;
}

export function languageName(code: string): string {
	return LANGUAGE_BY_CODE.get(code)?.name ?? code;
}

/** Google Ads geotarget id for a country: 2000 plus its ISO numeric code (United States 840 → 2840). */
export function googleGeotargetId(country: string): number {
	const entry = COUNTRY_BY_CODE.get(country);
	if (!entry) throw new Error(`Unsupported country "${country}"`);
	return 2000 + entry.numeric;
}

const TRADITIONAL_CHINESE_COUNTRIES = new Set(["TW", "HK"]);

/**
 * The interface language code Google takes as `hl`. Google still writes Hebrew
 * as `iw`, and splits Portuguese and Chinese by region.
 */
export function googleLanguageCode(market: Market): string {
	switch (market.language) {
		case "he":
			return "iw";
		case "pt":
			return market.country === "BR" ? "pt-BR" : "pt-PT";
		case "zh":
			return TRADITIONAL_CHINESE_COUNTRIES.has(market.country) ? "zh-TW" : "zh-CN";
		default:
			return market.language;
	}
}

/** The language as a translator should be asked for it: "Portuguese as written in Brazil". */
export function describeLanguageForMarket(market: Market): string {
	if (market.language === "zh") {
		return TRADITIONAL_CHINESE_COUNTRIES.has(market.country) ? "Traditional Chinese" : "Simplified Chinese";
	}
	return `${languageName(market.language)} as written in ${countryName(market.country)}`;
}

/** A market written as a locale, `de-CH`. */
export function marketId(market: Market): string {
	return `${market.language}-${market.country}`;
}

/** Comma-separated codes from a dashboard link. Unknown ones drop out, so a stale link still opens. */
function parseCodes(raw: string | null | undefined, normalize: (code: string) => string | null): string[] {
	if (!raw) return [];
	const codes = raw.split(",").map(normalize);
	return [...new Set(codes.filter((code): code is string => code !== null))];
}

export function parseCountryFilter(raw: string | null | undefined): string[] {
	return parseCodes(raw, normalizeCountry);
}

export function parseLanguageFilter(raw: string | null | undefined): string[] {
	return parseCodes(raw, normalizeLanguage);
}

/**
 * For API input. A dashboard link drops a code it can't read; a caller gets
 * told, since ignoring the filter would answer for the whole brand as if that
 * were what was asked.
 */
function codeFilterSchema(normalize: (code: string) => string | null, describe: (code: string) => string) {
	return z.string().superRefine((raw, ctx) => {
		const unknown = raw
			.split(",")
			.map((part) => part.trim())
			.find((part) => part && !normalize(part));
		if (unknown !== undefined) ctx.addIssue({ code: "custom", message: describe(unknown) });
	});
}

export const countryFilterSchema = codeFilterSchema(
	normalizeCountry,
	(code) => `Unsupported country "${code}". Use supported ISO 3166-1 alpha-2 codes such as "GB".`,
);

export const languageFilterSchema = codeFilterSchema(
	normalizeLanguage,
	(code) => `Unsupported language "${code}". Use supported ISO 639-1 codes such as "de".`,
);

export function sameMarket(a: Market, b: Market): boolean {
	return a.country === b.country && a.language === b.language;
}

/** "Switzerland · French" */
export function marketName(market: Market): string {
	return `${countryName(market.country)} · ${languageName(market.language)}`;
}

/**
 * The pairs a picker offers: each country in its own languages, then English,
 * which people search in everywhere. The API accepts any listed country with
 * any listed language.
 */
export const MARKETS: readonly Market[] = COUNTRIES.flatMap((country) =>
	[...country.languages, "en"].map((language) => ({ country: country.code, language })),
);

/** A prompt's own market wins field by field; what it leaves unset comes from its brand. */
export function resolveMarket(
	prompt: { country: string | null; language: string | null },
	brand: { country: string; language: string },
): Market {
	return { country: prompt.country ?? brand.country, language: prompt.language ?? brand.language };
}

export const countrySchema = z.string().transform((raw, ctx) => {
	const code = normalizeCountry(raw);
	if (code) return code;
	ctx.addIssue({
		code: "custom",
		message: `Unsupported country "${raw}". Use a supported ISO 3166-1 alpha-2 code such as "GB".`,
	});
	return z.NEVER;
});

export const languageSchema = z.string().transform((raw, ctx) => {
	const code = normalizeLanguage(raw);
	if (code) return code;
	ctx.addIssue({
		code: "custom",
		message: `Unsupported language "${raw}". Use a supported ISO 639-1 code such as "de".`,
	});
	return z.NEVER;
});
