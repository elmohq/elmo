// Mirrors the campaign params and click IDs posthog-js records on a landing pageview, plus our own `ref`.
export const ATTRIBUTION_PARAMS = [
	"ref",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
	"gad_source",
	"mc_cid",
	"gclid",
	"gclsrc",
	"dclid",
	"gbraid",
	"wbraid",
	"fbclid",
	"msclkid",
	"twclid",
	"li_fat_id",
	"igshid",
	"ttclid",
	"rdt_cid",
	"epik",
	"qclid",
	"sccid",
	"oppref",
	"irclid",
	"_kx",
] as const;

export type AttributionParams = Partial<Record<(typeof ATTRIBUTION_PARAMS)[number], string | number>>;

export function attributionParams(search: Record<string, unknown>): AttributionParams {
	return Object.fromEntries(
		ATTRIBUTION_PARAMS.flatMap((key) => {
			const value = search[key];
			return typeof value === "string" || typeof value === "number" ? [[key, value]] : [];
		}),
	);
}
