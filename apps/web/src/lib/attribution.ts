export const ATTRIBUTION_PARAMS = [
	"ref",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
	"gclid",
	"gbraid",
	"wbraid",
	"fbclid",
	"msclkid",
] as const;

export type AttributionParams = Partial<Record<(typeof ATTRIBUTION_PARAMS)[number], string | number>>;

export function attributionParams(search: Record<string, unknown>): AttributionParams {
	return Object.fromEntries(
		ATTRIBUTION_PARAMS.flatMap((key) => {
			const value = search[key];
			// The router parses `?utm_term=2026` as a number; a stringified "2026" would round-trip as `%222026%22`.
			return typeof value === "string" || typeof value === "number" ? [[key, value]] : [];
		}),
	);
}
