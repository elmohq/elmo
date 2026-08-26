/**
 * Cookie consent state, shared by the marketing site and the product app.
 *
 * The answer lives in localStorage rather than a cookie: it is strictly
 * necessary storage either way, and localStorage costs nothing on the wire.
 * Nothing here touches a third-party CMP — the whole model is two booleans.
 */

export interface CookieConsent {
	analytics: boolean;
	marketing: boolean;
}

const CONSENT_STORAGE_KEY = "elmo.cookie-consent";

/** Bump when the categories change, so a stored answer is re-asked rather than misread. */
const CONSENT_VERSION = 1;

/** Fired on this window whenever the stored answer changes. */
const CONSENT_CHANGE_EVENT = "elmo:consent-change";
/** Fired by the footer link to reopen the banner. */
export const CONSENT_OPEN_EVENT = "elmo:consent-open";

export const ACCEPT_ALL: CookieConsent = { analytics: true, marketing: true };
export const REJECT_ALL: CookieConsent = { analytics: false, marketing: false };

interface StoredConsent extends CookieConsent {
	version: number;
	at: string;
}

export function readConsent(): CookieConsent | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<StoredConsent>;
		if (parsed.version !== CONSENT_VERSION) return null;
		return { analytics: parsed.analytics === true, marketing: parsed.marketing === true };
	} catch {
		// Private-mode localStorage throws, and a hand-edited entry may not parse.
		// Either way we have no answer on file, so ask again.
		return null;
	}
}

export function saveConsent(consent: CookieConsent): void {
	if (typeof window === "undefined") return;
	const stored: StoredConsent = { ...consent, version: CONSENT_VERSION, at: new Date().toISOString() };
	try {
		window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
	} catch {
		// Storage being unavailable shouldn't stop the choice from applying to
		// this page view; it just won't survive a reload.
	}
	window.dispatchEvent(new CustomEvent<CookieConsent>(CONSENT_CHANGE_EVENT, { detail: consent }));
}

export function onConsentChange(listener: (consent: CookieConsent) => void): () => void {
	const handler = (event: Event) => listener((event as CustomEvent<CookieConsent>).detail);
	window.addEventListener(CONSENT_CHANGE_EVENT, handler);
	return () => window.removeEventListener(CONSENT_CHANGE_EVENT, handler);
}

export function openCookiePreferences(): void {
	window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

/**
 * The browser's Global Privacy Control signal, which California and several
 * other states treat as a binding opt-out of targeted advertising. It only sets
 * the default — an explicit "Accept" afterwards is still the user's choice.
 */
function hasGlobalPrivacyControl(): boolean {
	return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/**
 * Countries whose visitors need prior consent before a non-essential cookie is
 * set: the EEA (EU plus Iceland, Liechtenstein, Norway), the UK, and
 * Switzerland. Each app reads its own edge's geo header and asks this.
 */
const CONSENT_REQUIRED_COUNTRIES = new Set([
	"AT",
	"BE",
	"BG",
	"CH",
	"CY",
	"CZ",
	"DE",
	"DK",
	"EE",
	"ES",
	"FI",
	"FR",
	"GB",
	"GR",
	"HR",
	"HU",
	"IE",
	"IS",
	"IT",
	"LI",
	"LT",
	"LU",
	"LV",
	"MT",
	"NL",
	"NO",
	"PL",
	"PT",
	"RO",
	"SE",
	"SI",
	"SK",
]);

export function countryRequiresConsent(country: string): boolean {
	return CONSENT_REQUIRED_COUNTRIES.has(country.toUpperCase());
}

/**
 * Fallback for when the server can't tell where the request came from (no geo
 * header — local dev, or www served from somewhere other than Vercel).
 * Deliberately over-inclusive: `Europe/*` covers more than the EEA, and showing
 * the banner to someone who didn't need it is the harmless direction to err.
 */
const CONSENT_TIME_ZONES = [
	"Asia/Famagusta",
	"Asia/Nicosia",
	"Atlantic/Azores",
	"Atlantic/Canary",
	"Atlantic/Madeira",
	"Atlantic/Reykjavik",
];

function consentRequiredByTimeZone(): boolean {
	try {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return zone.startsWith("Europe/") || zone.startsWith("Arctic/") || CONSENT_TIME_ZONES.includes(zone);
	} catch {
		return false;
	}
}

/**
 * Whether prior consent is needed: the edge's answer when it has one, the
 * visitor's time zone when it doesn't. Call from the browser — on the server
 * the fallback would read the server's own time zone.
 */
export function isConsentRequired(fromEdge: boolean | null): boolean {
	return fromEdge ?? consentRequiredByTimeZone();
}

/**
 * Call `apply` with the visitor's current analytics answer, and again whenever
 * it changes. Returns an unsubscribe. Every analytics tool goes through this,
 * so they can't drift apart on what the same answer means.
 */
export function onAnalyticsConsent(consentRequired: boolean, apply: (allowed: boolean) => void): () => void {
	if (typeof window === "undefined") return () => {};
	apply(resolveConsent(readConsent(), consentRequired).analytics);
	return onConsentChange((consent) => apply(consent.analytics));
}

/**
 * What the visitor's answer means right now. With no answer on file, consent
 * regions get nothing and everywhere else gets analytics — plus advertising,
 * unless the browser is already asking us not to.
 */
export function resolveConsent(stored: CookieConsent | null, consentRequired: boolean): CookieConsent {
	if (stored) return stored;
	if (consentRequired) return REJECT_ALL;
	return { analytics: true, marketing: !hasGlobalPrivacyControl() };
}
