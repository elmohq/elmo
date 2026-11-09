const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
export const CLICK_ID_PARAMS = ["gclid", "gbraid", "wbraid", "fbclid", "msclkid", "li_fat_id"] as const;

export const FORWARDED_PARAMS = [...UTM_PARAMS, ...CLICK_ID_PARAMS, "landing_page", "referrer"] as const;

export const ATTRIBUTION_KEYS = ["ref", ...FORWARDED_PARAMS] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type SignupAttribution = Partial<Record<AttributionKey, string>>;

export const MAX_ATTRIBUTION_VALUE_LENGTH = 256;

const KEYS = new Set<string>(ATTRIBUTION_KEYS);

export function sanitizeAttribution(input: unknown): SignupAttribution {
	if (!input || typeof input !== "object" || Array.isArray(input)) return {};
	const clean: SignupAttribution = {};
	for (const [key, value] of Object.entries(input)) {
		if (!KEYS.has(key) || typeof value !== "string") continue;
		const text = value
			.replace(/\p{Cc}/gu, "")
			.trim()
			.slice(0, MAX_ATTRIBUTION_VALUE_LENGTH);
		if (text) clean[key as AttributionKey] = text;
	}
	return clean;
}

export function isEmptyAttribution(attribution: SignupAttribution): boolean {
	return Object.keys(attribution).length === 0;
}

function hostOf(url: string): string | null {
	try {
		return new URL(url).host || null;
	} catch {
		return null;
	}
}

export function attributionFromLanding(pageUrl: string, documentReferrer: string): SignupAttribution {
	let page: URL;
	try {
		page = new URL(pageUrl);
	} catch {
		return {};
	}
	const raw: Record<string, string> = {};
	for (const key of ATTRIBUTION_KEYS) {
		const value = page.searchParams.get(key);
		if (value) raw[key] = value;
	}
	if (!page.searchParams.has("landing_page")) {
		delete raw.referrer;
		raw.landing_page = `${page.host}${page.pathname}`;
		const referrerHost = hostOf(documentReferrer);
		if (referrerHost && referrerHost !== page.host) raw.referrer = referrerHost;
	}
	return sanitizeAttribution(raw);
}

export function firstTouch(stored: SignupAttribution | null, current: SignupAttribution): SignupAttribution {
	return stored && !isEmptyAttribution(stored) ? stored : current;
}

export function withAttribution(href: string, attribution: SignupAttribution): string {
	let link: URL;
	try {
		link = new URL(href);
	} catch {
		return href;
	}
	let changed = false;
	for (const key of FORWARDED_PARAMS) {
		const value = attribution[key];
		if (value && !link.searchParams.has(key)) {
			link.searchParams.set(key, value);
			changed = true;
		}
	}
	return changed ? link.toString() : href;
}
