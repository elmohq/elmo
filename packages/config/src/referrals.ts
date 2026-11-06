/** Links back to our sites carry a `ref` naming the surface clicked, since each wants different things. */

export const MARKETING_SITE_URL = "https://www.elmohq.com";
export const CLOUD_APP_URL = "https://app.elmohq.com";
const DEMO_SITE_URL = "https://demo.elmohq.com";

/** A closed set: in analytics a typo is indistinguishable from a real source. */
export type ReferralSource =
	| "cli"
	| "self-hosted-signin"
	| "self-hosted-signup"
	| "cloud-signin"
	| "cloud-signup"
	| "marketing-cta"
	| "marketing-nav"
	| "marketing-hero"
	| "marketing-ai-referral"
	| "marketing-demo-frame"
	| "marketing-closing"
	| "marketing-pricing-closing"
	| "marketing-aeo-for-hero"
	| "marketing-aeo-for-closing"
	| "marketing-profound-users-hero"
	| "marketing-profound-users-closing"
	| "marketing-features-hero"
	| "marketing-features-closing"
	| "marketing-page-cta"
	| "marketing-vision"
	| "marketing-about"
	| "marketing-support"
	| "marketing-webmcp"
	| "demo-chat"
	| "demo-header"
	| "demo-read-only"
	| "marketing-plan-starter"
	| "marketing-plan-basic"
	| "marketing-plan-pro"
	| "marketing-plan-business"
	| "marketing-pricing-starter"
	| "marketing-pricing-basic"
	| "marketing-pricing-pro"
	| "marketing-pricing-business";

function tagged(url: string, ref: ReferralSource): string {
	const link = new URL(url);
	link.searchParams.set("ref", ref);
	return link.toString();
}

export function marketingUrl(path: string, ref: ReferralSource): string {
	return tagged(new URL(path, MARKETING_SITE_URL).toString(), ref);
}

/** Routes new visitors to sign-up on its own. */
export function cloudAppUrl(ref: ReferralSource): string {
	return tagged(`${CLOUD_APP_URL}/`, ref);
}

export function cloudSignupUrl(ref: ReferralSource): string {
	return tagged(`${CLOUD_APP_URL}/auth/register`, ref);
}

export function cloudPricingUrl(ref: ReferralSource): string {
	return marketingUrl("/pricing", ref);
}

export function bookDemoUrl(ref: ReferralSource): string {
	return marketingUrl("/demo", ref);
}

export function demoSiteUrl(ref: ReferralSource, path = "/"): string {
	return tagged(new URL(path, DEMO_SITE_URL).toString(), ref);
}

export type LinkClickGoal = "Cloud CTA Click" | "Live Demo Click" | "Book Demo Click";

export interface LinkClick {
	goal: LinkClickGoal;
	props: { ref?: string; page: string; destination: string };
}

export function classifyLinkClick(href: string, pageUrl: string): LinkClick | null {
	let page: URL;
	let link: URL;
	try {
		page = new URL(pageUrl);
		link = new URL(href, page);
	} catch {
		return null;
	}
	if (link.protocol !== "https:" && link.protocol !== "http:") return null;

	const sameSite = link.host === page.host;
	let goal: LinkClickGoal;
	if (link.origin === CLOUD_APP_URL && !sameSite) goal = "Cloud CTA Click";
	else if (link.origin === DEMO_SITE_URL && !sameSite) goal = "Live Demo Click";
	else if ((link.origin === MARKETING_SITE_URL || sameSite) && link.pathname.replace(/\/$/, "") === "/demo")
		goal = "Book Demo Click";
	else return null;

	const ref = link.searchParams.get("ref");
	return {
		goal,
		props: {
			...(ref ? { ref } : {}),
			page: page.pathname,
			destination: `${link.host}${link.pathname}`,
		},
	};
}
