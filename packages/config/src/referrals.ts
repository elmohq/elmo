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
/** Where a demo is booked. Not on our domain, but ours, and tagged the same way. */
const BOOK_DEMO_URL = "https://cal.com/jrhizor/elmo";
/** The read-only instance anyone can poke at without an account. */
const DEMO_SITE_URL = "https://demo.elmohq.com";

/**
 * Where a link back to us was clicked. A closed set rather than free-form
 * strings: these end up in analytics, where a typo is indistinguishable from a
 * real source.
 */
export type ReferralSource =
	| "cli"
	| "self-hosted-signin"
	| "self-hosted-signup"
	| "cloud-signin"
	| "cloud-signup"
	| "marketing-cta";

function tagged(url: string, ref: ReferralSource): string {
	const link = new URL(url);
	link.searchParams.set("ref", ref);
	return link.toString();
}

/** A marketing-site page, tagged with where the click came from. */
export function marketingUrl(path: string, ref: ReferralSource): string {
	return tagged(new URL(path, MARKETING_SITE_URL).toString(), ref);
}

/** Cloud registration, tagged with where the click came from. */
export function cloudSignupUrl(ref: ReferralSource): string {
	return tagged(`${CLOUD_APP_URL}/auth/register`, ref);
}

/** The cloud pricing table, tagged with where the click came from. */
export function cloudPricingUrl(ref: ReferralSource): string {
	return marketingUrl("/pricing", ref);
}

/** The demo booking page, tagged with where the click came from. */
export function bookDemoUrl(ref: ReferralSource): string {
	return tagged(BOOK_DEMO_URL, ref);
}

/** The live demo instance, tagged with where the click came from. */
export function demoSiteUrl(ref: ReferralSource): string {
	return tagged(DEMO_SITE_URL, ref);
}
