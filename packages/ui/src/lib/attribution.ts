import {
	attributionFromLanding,
	firstTouch,
	type SignupAttribution,
	sanitizeAttribution,
} from "@workspace/config/signup-attribution";
import { onAnalyticsConsent } from "./cookie-consent";

export const ATTRIBUTION_STORAGE_KEY = "elmo.attribution";

type StorageKind = "localStorage" | "sessionStorage";

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

export function currentAttribution(kind: StorageKind): SignupAttribution {
	return firstTouch(readStored(kind), landing);
}

export function storedAttribution(kind: StorageKind): SignupAttribution | null {
	return readStored(kind);
}

export function markAttributionUsed(kind: StorageKind): void {
	try {
		storage(kind)?.setItem(ATTRIBUTION_STORAGE_KEY, "used");
	} catch {}
}
