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

export type AttributionParams = Partial<Record<(typeof ATTRIBUTION_PARAMS)[number], string>>;

export function attributionParams(search: Record<string, unknown>): AttributionParams {
	return Object.fromEntries(
		ATTRIBUTION_PARAMS.flatMap((key) => {
			const value = search[key];
			// The router parses numeric-looking values, so `?utm_term=2026` arrives as a number.
			return typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : [];
		}),
	);
}
