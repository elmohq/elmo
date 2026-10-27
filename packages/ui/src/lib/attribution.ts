import {
	attributionFromLanding,
	firstTouch,
	type SignupAttribution,
	sanitizeAttribution,
} from "@workspace/config/signup-attribution";
import { onAnalyticsConsent } from "./cookie-consent";

export const ATTRIBUTION_STORAGE_KEY = "elmo.attribution";

type StorageKind = "localStorage" | "sessionStorage";

// Read when the bundle loads: the router can rewrite the URL to drop search
// params a route doesn't declare before any effect runs.
const landing: SignupAttribution =
	typeof window === "undefined" ? {} : attributionFromLanding(window.location.href, document.referrer);

function storage(kind: StorageKind): Storage | null {
	try {
		return window[kind];
	} catch {
		return null;
	}
}

function readStored(kind: StorageKind): SignupAttribution | null {
	const raw = storage(kind)?.getItem(ATTRIBUTION_STORAGE_KEY);
	if (!raw) return null;
	try {
		return sanitizeAttribution(JSON.parse(raw));
	} catch {
		return null;
	}
}

/**
 * Keeps where this visitor first arrived from in `kind`, once analytics consent
 * allows storing it, and clears it if consent is withdrawn. Until then it only
 * lives in memory for this page load. Returns an unsubscribe.
 */
export function rememberAttribution(kind: StorageKind, consentRequired: boolean): () => void {
	return onAnalyticsConsent(consentRequired, (allowed) => {
		const store = storage(kind);
		if (!store) return;
		try {
			if (!allowed) store.removeItem(ATTRIBUTION_STORAGE_KEY);
			else if (store.getItem(ATTRIBUTION_STORAGE_KEY) === null)
				store.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(landing));
		} catch {}
	});
}

/** The visitor's first-touch attribution: what was stored, else this page load's. */
export function currentAttribution(kind: StorageKind): SignupAttribution {
	return firstTouch(readStored(kind), landing);
}

/** Only what made it into storage, so a value never outlives a refusal. */
export function storedAttribution(kind: StorageKind): SignupAttribution | null {
	return readStored(kind);
}

/**
 * Stops this browser from offering its attribution again. The key stays set so
 * a later visit doesn't capture a fresh first touch for the same person.
 */
export function markAttributionUsed(kind: StorageKind): void {
	try {
		storage(kind)?.setItem(ATTRIBUTION_STORAGE_KEY, "used");
	} catch {}
}
