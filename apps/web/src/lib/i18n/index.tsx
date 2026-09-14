/**
 * Minimal i18n: the English copy is the message key (gettext-style), so the
 * source stays readable and any string missing from a dictionary falls back to
 * English instead of rendering a key.
 */
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { fr } from "./fr";

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "elmo-locale";

type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Record<string, string> | null> = { en: null, fr };
const INTL_TAG: Record<Locale, string> = { en: "en-US", fr: "fr-FR" };

export function isLocale(value: unknown): value is Locale {
	return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Cookie wins; otherwise the browser's Accept-Language preference. */
export function resolveLocale(
	cookieHeader: string | null | undefined,
	acceptLanguage: string | null | undefined,
): Locale {
	const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
	if (isLocale(match?.[1])) return match[1];
	return acceptLanguage?.trim().toLowerCase().startsWith("fr") ? "fr" : "en";
}

// French typography: a narrow no-break space before high punctuation, a
// no-break space before % — so "Visibilité :" never wraps its colon alone.
function frenchTypography(text: string): string {
	return text.replace(/ ([:;!?])/g, " $1").replace(/ %/g, " %");
}

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
	return value.toLocaleString(INTL_TAG[locale], options);
}

export function formatDate(
	locale: Locale,
	value: Date | string | number,
	options?: Intl.DateTimeFormatOptions,
): string {
	return new Date(value).toLocaleDateString(INTL_TAG[locale], options);
}

export function formatDateTime(
	locale: Locale,
	value: Date | string | number,
	options?: Intl.DateTimeFormatOptions,
): string {
	return new Date(value).toLocaleString(INTL_TAG[locale], options);
}

export function translate(locale: Locale, text: string, vars?: Vars): string {
	const dictionary = DICTIONARIES[locale];
	let out = dictionary?.[text] ?? text;
	if (vars) {
		out = out.replace(/\{(\w+)\}/g, (whole, name: string) => {
			const value = vars[name];
			if (value === undefined) return whole;
			return typeof value === "number" ? formatNumber(locale, value) : value;
		});
	}
	return locale === "fr" ? frenchTypography(out) : out;
}

/**
 * Plural by the target language's rules, not English's: French treats 0 as
 * singular ("0 réponse"), English doesn't ("0 responses").
 */
export function translatePlural(locale: Locale, count: number, one: string, other: string, vars?: Vars): string {
	const form = new Intl.PluralRules(INTL_TAG[locale]).select(count) === "one" ? one : other;
	return translate(locale, form, { count, ...vars });
}

function makeI18n(locale: Locale) {
	return {
		locale,
		t: (text: string, vars?: Vars) => translate(locale, text, vars),
		tn: (count: number, one: string, other: string, vars?: Vars) => translatePlural(locale, count, one, other, vars),
		n: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(locale, value, options),
		/** A value already in percent units (42 → "42%" / "42 %"). */
		p: (value: number, options?: Intl.NumberFormatOptions) =>
			`${formatNumber(locale, value, options)}${locale === "fr" ? " " : ""}%`,
		d: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => formatDate(locale, value, options),
		dt: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => formatDateTime(locale, value, options),
	};
}

export type I18n = ReturnType<typeof makeI18n>;

const I18nContext = createContext<I18n>(makeI18n("en"));

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
	const value = useMemo(() => makeI18n(locale), [locale]);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
	return useContext(I18nContext);
}

/**
 * For code outside render (toasts, confirm dialogs, event handlers). Reads the
 * `lang` the server stamped on <html>, so it agrees with what was rendered.
 * Never call it during render — on the server it can't see the request.
 */
export function i18n(): I18n {
	const lang = typeof document === "undefined" ? undefined : document.documentElement.lang;
	return makeI18n(isLocale(lang) ? lang : "en");
}

export function setLocale(locale: Locale) {
	document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
	// A full reload re-renders server-side in the new language and drops the
	// client caches (root config, query data) that hold already-formatted text.
	window.location.reload();
}
