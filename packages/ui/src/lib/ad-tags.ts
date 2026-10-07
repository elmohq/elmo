import { onMarketingConsent } from "./cookie-consent";
import { afterPageIdle } from "./idle";

/**
 * Google Ads and Meta Pixel, shared by the marketing site and Elmo's own hosted
 * app (cloud and the public demo). Each platform stays off while its ID is
 * empty, and nothing loads until advertising consent is in effect.
 */

/** Google Ads tag ID, `AW-…`. */
const GOOGLE_ADS_ID = "";
/** Meta Pixel ID (Events Manager → Data sources). */
const META_PIXEL_ID = "2332896134120550";

export type AdConversion = "sign_up" | "purchase";

/** Content-Security-Policy sources the two tags need, per directive. Images are covered by `https:`. */
export const AD_TAG_CSP = {
	script:
		"https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://connect.facebook.net",
	connect:
		"https://www.google.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://*.doubleclick.net https://pagead2.googlesyndication.com https://www.facebook.com https://connect.facebook.net",
	frame: "https://td.doubleclick.net https://bid.g.doubleclick.net https://www.googletagmanager.com",
};

/** Google Ads → Goals → Conversions: the label half of each action's `send_to`. */
const GOOGLE_ADS_CONVERSION_LABELS: Record<AdConversion, string> = {
	sign_up: "",
	purchase: "",
};

const META_EVENTS: Record<AdConversion, string> = {
	sign_up: "CompleteRegistration",
	purchase: "Purchase",
};

// First-party cookies the two tags set on our own domain. Their third-party
// cookies live on google.com and facebook.com, out of our reach.
const AD_COOKIE = /^(_gcl_|_fbp$|_fbc$)/;
const SENT_STORAGE_PREFIX = "elmo.ad-conversion.";

type Command = (...args: unknown[]) => void;
type MetaQueue = Command & { callMethod?: Command; queue: unknown[]; push: Command; loaded: boolean; version: string };

declare global {
	interface Window {
		dataLayer?: unknown[];
		gtag?: Command;
		fbq?: MetaQueue;
		_fbq?: MetaQueue;
	}
}

let allowed = false;
let loaded = false;
// A page view asked for while advertising was off. Accepting counts the page
// they accepted on, the way the analytics tools do.
let pageViewPending = false;
// React runs a page's effects before the root's, so a conversion can be
// reported before the stored answer has been read. Those wait for it; ones
// made after a refusal are dropped.
let answered = false;
const heldConversions: (() => void)[] = [];
let lastPathname: string | null = null;

function gtag(...args: unknown[]): void {
	if (GOOGLE_ADS_ID) window.gtag?.(...args);
}

function fbq(...args: unknown[]): void {
	if (META_PIXEL_ID) window.fbq?.(...args);
}

function injectScript(src: string): void {
	const script = document.createElement("script");
	script.async = true;
	script.src = src;
	document.head.appendChild(script);
}

function stubGoogle(): void {
	window.dataLayer ??= [];
	// gtag.js only recognises commands pushed as `arguments` objects; a plain
	// array is read as a dataLayer message and silently ignored.
	window.gtag ??= function gtag() {
		window.dataLayer?.push(arguments);
	};
}

function stubMeta(): void {
	if (window.fbq) return;
	const queue = ((...args: unknown[]) => {
		if (queue.callMethod) queue.callMethod(...args);
		else queue.queue.push(args);
	}) as MetaQueue;
	queue.push = queue;
	queue.loaded = true;
	queue.version = "2.0";
	queue.queue = [];
	window.fbq = queue;
	window._fbq ??= queue;
}

function applyConsent(): void {
	const state = allowed ? "granted" : "denied";
	gtag("consent", "update", { ad_storage: state, ad_user_data: state, ad_personalization: state });
	fbq("consent", allowed ? "grant" : "revoke");
}

// Both tags queue every command until their script arrives, so the scripts
// themselves can wait for the page to settle without losing anything.
function load(): void {
	if (loaded) return;
	loaded = true;

	if (GOOGLE_ADS_ID) {
		stubGoogle();
		gtag("consent", "default", {
			ad_storage: "denied",
			ad_user_data: "denied",
			ad_personalization: "denied",
			// Ads only — Google Analytics isn't loaded through this tag.
			analytics_storage: "denied",
		});
	}
	if (META_PIXEL_ID) {
		stubMeta();
		// Automatic configuration scrapes button clicks and page metadata, which
		// inside the app would hand Meta customer data.
		fbq("set", "autoConfig", false, META_PIXEL_ID);
	}
	applyConsent();
	gtag("js", new Date());
	gtag("config", GOOGLE_ADS_ID, { send_page_view: false });
	fbq("init", META_PIXEL_ID);

	void afterPageIdle().then(() => {
		if (GOOGLE_ADS_ID) injectScript(`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`);
		if (META_PIXEL_ID) injectScript("https://connect.facebook.net/en_US/fbevents.js");
	});
}

function sendPageView(): void {
	load();
	gtag("event", "page_view", { send_to: GOOGLE_ADS_ID });
	fbq("track", "PageView");
}

function clearAdCookies(): void {
	const labels = window.location.hostname.split(".");
	const domains = labels.map((_, index) => labels.slice(index).join("."));
	for (const entry of document.cookie.split("; ")) {
		const name = entry.split("=")[0];
		if (!AD_COOKIE.test(name)) continue;
		document.cookie = `${name}=; Max-Age=0; path=/`;
		for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
	}
}

/**
 * Follow the visitor's advertising consent for the rest of the session. Tags
 * aren't fetched until the first page view or conversion needs them. Returns an
 * unsubscribe.
 */
export function initAdTags(consentRequired: boolean): () => void {
	if (!GOOGLE_ADS_ID && !META_PIXEL_ID) return () => {};
	return onMarketingConsent(consentRequired, (answer) => {
		allowed = answer;
		answered = true;
		if (loaded) {
			applyConsent();
			if (!allowed) clearAdCookies();
		}
		const held = heldConversions.splice(0);
		if (!allowed) return;
		if (pageViewPending) {
			pageViewPending = false;
			sendPageView();
		}
		for (const send of held) send();
	});
}

/**
 * Count a page view for remarketing audiences. Repeat calls for the path last
 * counted are ignored, so a re-run effect doesn't count a page twice.
 */
export function trackAdPageView(pathname: string): void {
	if (!GOOGLE_ADS_ID && !META_PIXEL_ID) return;
	if (pathname === lastPathname) return;
	lastPathname = pathname;
	if (allowed) sendPageView();
	else pageViewPending = true;
}

function alreadySent(key: string): boolean {
	try {
		return window.localStorage.getItem(key) !== null;
	} catch {
		return false;
	}
}

function markSent(key: string): void {
	try {
		window.localStorage.setItem(key, new Date().toISOString());
	} catch {
		// Without storage a reload can count it again; Google still dedupes
		// purchases on transaction_id.
	}
}

/**
 * Report a conversion once per `id` on this browser. `id` also dedupes on the
 * platforms' side, so pass something stable (the org, the subscription).
 */
export function trackAdConversion(conversion: AdConversion, { id, valueUsd }: { id: string; valueUsd?: number }): void {
	if (!GOOGLE_ADS_ID && !META_PIXEL_ID) return;
	if (!answered) {
		heldConversions.push(() => trackAdConversion(conversion, { id, valueUsd }));
		return;
	}
	if (!allowed) return;
	const key = `${SENT_STORAGE_PREFIX}${conversion}.${id}`;
	if (alreadySent(key)) return;
	markSent(key);
	load();

	const value = valueUsd === undefined ? {} : { value: valueUsd, currency: "USD" };
	const label = GOOGLE_ADS_CONVERSION_LABELS[conversion];
	if (label) {
		gtag("event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${label}`, transaction_id: id, ...value });
	}
	fbq("track", META_EVENTS[conversion], value, { eventID: `${conversion}.${id}` });
}
