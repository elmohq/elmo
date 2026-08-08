import { z } from "zod";

export const supportedLocales = ["en", "es", "ja", "zh-CN", "zh-TW"] as const;
export const localeSchema = z.enum(supportedLocales);
export const localePreferenceSchema = z.union([z.literal("auto"), localeSchema]);

export type Locale = z.infer<typeof localeSchema>;
export type LocalePreference = z.infer<typeof localePreferenceSchema>;

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
	return localeSchema.safeParse(value).success;
}

export function isLocalePreference(value: unknown): value is LocalePreference {
	return localePreferenceSchema.safeParse(value).success;
}

export function matchAcceptLanguage(header: string | null | undefined): Locale | undefined {
	if (!header) return undefined;

	const candidates = header
		.split(",")
		.map((entry, index) => {
			const [tag, ...parameters] = entry.trim().split(";");
			const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
			const quality = qualityParameter ? Number.parseFloat(qualityParameter.trim().slice(2)) : 1;
			return { tag: tag.toLowerCase(), quality: Number.isFinite(quality) ? quality : 0, index };
		})
		.filter(({ tag, quality }) => tag && tag !== "*" && quality > 0)
		.sort((a, b) => b.quality - a.quality || a.index - b.index);

	for (const { tag } of candidates) {
		if (tag === "zh-tw" || tag === "zh-hk" || tag === "zh-mo" || tag.startsWith("zh-hant")) return "zh-TW";
		if (tag === "zh-cn" || tag === "zh-sg" || tag.startsWith("zh-hans") || tag === "zh") return "zh-CN";
		if (tag === "ja" || tag.startsWith("ja-")) return "ja";
		if (tag === "es" || tag.startsWith("es-")) return "es";
		if (tag === "en" || tag.startsWith("en-")) return "en";
	}

	return undefined;
}

export function resolveLocale(input: {
	preference?: unknown;
	acceptLanguage?: string | null;
	systemDefault?: unknown;
}): Locale {
	if (input.preference !== "auto" && isLocale(input.preference)) return input.preference;
	return matchAcceptLanguage(input.acceptLanguage) ?? (isLocale(input.systemDefault) ? input.systemDefault : DEFAULT_LOCALE);
}
