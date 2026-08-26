/**
 * Links from the product and the CLI back to our own sites.
 *
 * Each one carries a `ref` naming the surface it was clicked from, so the
 * marketing site can tell a self-hosted operator who arrived from the sign-in
 * page apart from one who arrived from `elmo init` — the two want different
 * things and convert at very different rates.
 */

export const MARKETING_SITE_URL = "https://www.elmohq.com";
export const CLOUD_APP_URL = "https://app.elmohq.com";

/**
 * Where a link back to us was clicked. A closed set rather than free-form
 * strings: these end up in analytics, where a typo is indistinguishable from a
 * real source.
 */
export type ReferralSource = "cli" | "self-hosted-signin" | "self-hosted-signup" | "cloud-signin" | "cloud-signup";

function tagged(base: string, path: string, ref: ReferralSource): string {
	const url = new URL(path, base);
	url.searchParams.set("ref", ref);
	return url.toString();
}

/** A marketing-site page, tagged with where the click came from. */
export function marketingUrl(path: string, ref: ReferralSource): string {
	return tagged(MARKETING_SITE_URL, path, ref);
}

/** Cloud registration, tagged with where the click came from. */
export function cloudSignupUrl(ref: ReferralSource): string {
	return tagged(CLOUD_APP_URL, "/auth/register", ref);
}

/** The cloud pricing table, tagged with where the click came from. */
export function cloudPricingUrl(ref: ReferralSource): string {
	return marketingUrl("/pricing", ref);
}
