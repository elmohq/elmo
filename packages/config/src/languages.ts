import { z } from "zod";

/**
 * The languages a prompt can be written in. Separate from its country because
 * markets don't map onto one language (Switzerland, Belgium, Canada) and the
 * same country is often tracked in two.
 *
 * Every code here is accepted by Google's `hl` and by each DataForSEO surface
 * Elmo uses, which is why Portuguese is Brazilian only: Google AI Mode and the
 * Gemini scraper take no other Portuguese.
 */

export const DEFAULT_LANGUAGE = "en";

export interface Language {
	/** BCP 47, as Google writes it; what's stored and what the API accepts. */
	code: string;
	name: string;
}

export const LANGUAGES: readonly Language[] = [
	{ code: "en", name: "English" },
	{ code: "es", name: "Spanish" },
	{ code: "fr", name: "French" },
	{ code: "de", name: "German" },
	{ code: "it", name: "Italian" },
	{ code: "nl", name: "Dutch" },
	{ code: "pt-BR", name: "Portuguese" },
	{ code: "sv", name: "Swedish" },
	{ code: "da", name: "Danish" },
	{ code: "no", name: "Norwegian" },
	{ code: "fi", name: "Finnish" },
	{ code: "pl", name: "Polish" },
	{ code: "cs", name: "Czech" },
	{ code: "sk", name: "Slovak" },
	{ code: "ro", name: "Romanian" },
	{ code: "hu", name: "Hungarian" },
	{ code: "bg", name: "Bulgarian" },
	{ code: "hr", name: "Croatian" },
	{ code: "sl", name: "Slovenian" },
	{ code: "el", name: "Greek" },
	{ code: "ca", name: "Catalan" },
	{ code: "tr", name: "Turkish" },
	{ code: "uk", name: "Ukrainian" },
	{ code: "ar", name: "Arabic" },
	{ code: "he", name: "Hebrew" },
	{ code: "hi", name: "Hindi" },
	{ code: "id", name: "Indonesian" },
	{ code: "ms", name: "Malay" },
	{ code: "fil", name: "Filipino" },
	{ code: "th", name: "Thai" },
	{ code: "vi", name: "Vietnamese" },
	{ code: "ja", name: "Japanese" },
	{ code: "ko", name: "Korean" },
	{ code: "zh-CN", name: "Chinese (Simplified)" },
	{ code: "zh-TW", name: "Chinese (Traditional)" },
];

const BY_LOWER_CODE = new Map(LANGUAGES.map((language) => [language.code.toLowerCase(), language]));

/** Case-insensitive, returning the canonical code (`zh-cn` → `zh-CN`). */
export function normalizeLanguageCode(raw: string): string | null {
	return BY_LOWER_CODE.get(raw.trim().toLowerCase())?.code ?? null;
}

export function languageName(code: string): string {
	return BY_LOWER_CODE.get(code.toLowerCase())?.name ?? code;
}

/** Same rules as `parseCountryFilter`: unknown codes drop out. */
export function parseLanguageFilter(raw: string | undefined | null): string[] {
	if (!raw) return [];
	const codes = raw.split(",").map(normalizeLanguageCode);
	return [...new Set(codes.filter((code): code is string => code !== null))];
}

export const languageCodeSchema = z.string().transform((raw, ctx) => {
	const code = normalizeLanguageCode(raw);
	if (code) return code;
	ctx.addIssue({
		code: "custom",
		message: `Unsupported language "${raw}". Use a code such as "en", "de", or "pt-BR".`,
	});
	return z.NEVER;
});
