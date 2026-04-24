export type CitationCategory = "brand" | "competitor" | "social_media" | "google" | "institutional" | "other";

const SOCIAL_MEDIA_DOMAINS = [
	"facebook.com", "twitter.com", "x.com", "instagram.com", "linkedin.com",
	"youtube.com", "tiktok.com", "pinterest.com", "reddit.com", "snapchat.com",
	"tumblr.com", "whatsapp.com", "telegram.org", "discord.com", "twitch.tv",
	"threads.net", "threads.com",
];

const GOOGLE_OWNED_DOMAINS = [
	"google.com", "google.org", "google.dev", "google.cloud",
	"googleapis.com", "googleusercontent.com", "googleblog.com",
	"googlesource.com", "googlecode.com",
	"blog.google", "about.google", "store.google",
	"android.com", "chromium.org", "chrome.com",
	"youtube.google.com", "withgoogle.com",
	"firebase.com", "firebaseio.com",
	"gstatic.com", "ggpht.com",
	"gmail.com", "googlemail.com",
	"google.ai", "deepmind.google", "deepmind.com",
	"kaggle.com", "waze.com", "fitbit.com",
	"blogger.com", "blogspot.com",
	"appspot.com", "web.app", "firebaseapp.com",
	"googlemaps.com", "google.maps",
	"doubleclick.net", "googlesyndication.com", "googleadservices.com",
	"google.shopping", "google.flights",
];

// TLDs and second-level domains that indicate institutional/government/academic sites
const INSTITUTIONAL_TLDS = new Set(["edu", "gov", "mil", "int"]);
const INSTITUTIONAL_SLDS = new Set(["edu", "gov", "org", "ac", "mil", "govt", "gob"]);

const INSTITUTIONAL_DOMAINS = new Set([
	"nhs.uk", "nhs.net",
	"nih.gov", "cdc.gov", "fda.gov", "who.int",
	"europa.eu", "un.org", "unesco.org", "unicef.org",
	"worldbank.org", "imf.org", "wto.org",
	"nato.int", "icrc.org",
	"mayo.edu", "mayoclinic.org", "clevelandclinic.org", "hopkinsmedicine.org", "webmd.com",
	"pubmed.ncbi.nlm.nih.gov", "medlineplus.gov", "cochrane.org",
	"bbc.co.uk", "npr.org", "pbs.org", "abc.net.au",
	"arxiv.org", "doi.org", "jstor.org", "ncbi.nlm.nih.gov",
	"ieee.org", "acm.org", "nature.com", "sciencedirect.com", "springer.com", "wiley.com",
	"parliament.uk", "legislation.gov.uk", "service.gov.uk",
	"canada.ca", "gc.ca", "gov.au", "govt.nz",
]);

export function extractDomain(urlOrDomain: string): string {
	try {
		const cleaned = urlOrDomain.replace(/^https?:\/\//, "");
		const withoutWww = cleaned.replace(/^www\./, "");
		return withoutWww.split("/")[0].toLowerCase();
	} catch {
		return urlOrDomain.toLowerCase();
	}
}

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Clean and validate a user-entered domain string.
 * Strips protocols, www prefix, and trailing paths. Returns the cleaned domain
 * if valid, or null if the input doesn't look like a valid domain.
 */
export function cleanAndValidateDomain(input: string): string | null {
	const cleaned = extractDomain(input.trim());
	if (!cleaned || !DOMAIN_REGEX.test(cleaned)) return null;
	return cleaned;
}

export function normalizeUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		if (urlObj.searchParams.get("utm_source") === "openai") {
			urlObj.searchParams.delete("utm_source");
		}
		urlObj.search = urlObj.searchParams.toString();
		urlObj.hash = urlObj.hash.replace(/:~:text=[^&]*/, "");
		if (urlObj.hash === "#") urlObj.hash = "";
		urlObj.protocol = "https:";
		urlObj.hostname = urlObj.hostname.replace(/^www\./, "").toLowerCase();
		if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith("/")) {
			urlObj.pathname = urlObj.pathname.slice(0, -1);
		}
		return urlObj.toString();
	} catch {
		return url;
	}
}

export function isSocialMediaDomain(domain: string): boolean {
	return SOCIAL_MEDIA_DOMAINS.some((sm) => domain === sm || domain.endsWith(`.${sm}`));
}

export function isGoogleDomain(domain: string): boolean {
	if (GOOGLE_OWNED_DOMAINS.some((g) => domain === g || domain.endsWith(`.${g}`))) return true;
	// Google country-specific TLDs: google.co.uk, google.com.au, google.de, etc.
	if (/^google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(domain)) return true;
	return false;
}

export function isInstitutionalDomain(domain: string): boolean {
	if (INSTITUTIONAL_DOMAINS.has(domain)) return true;
	for (const inst of INSTITUTIONAL_DOMAINS) {
		if (domain.endsWith(`.${inst}`)) return true;
	}
	const parts = domain.split(".");
	if (parts.length < 2) return false;
	const tld = parts[parts.length - 1];
	if (INSTITUTIONAL_TLDS.has(tld)) return true;
	if (tld === "org") return true;
	if (parts.length >= 3) {
		const sld = parts[parts.length - 2];
		if (INSTITUTIONAL_SLDS.has(sld)) return true;
	}
	return false;
}

export function categorizeDomain(
	domain: string,
	brandDomains: Set<string>,
	competitorDomains: Set<string>,
): CitationCategory {
	for (const bd of brandDomains) {
		if (domain === bd || domain.endsWith(`.${bd}`)) return "brand";
	}
	for (const cd of competitorDomains) {
		if (domain === cd || domain.endsWith(`.${cd}`)) return "competitor";
	}
	if (isSocialMediaDomain(domain)) return "social_media";
	if (isGoogleDomain(domain)) return "google";
	if (isInstitutionalDomain(domain)) return "institutional";
	return "other";
}

/**
 * Round category counts to percentages that always sum to exactly 100.
 * Uses largest-remainder method to distribute rounding residuals.
 */
export function toRoundedPercentages(counts: Record<string, number>): Record<string, number> {
	const entries = Object.entries(counts);
	const total = entries.reduce((s, [, v]) => s + v, 0);
	if (total === 0) return Object.fromEntries(entries.map(([k]) => [k, 0]));

	const raw = entries.map(([k, v]) => ({ key: k, exact: (v / total) * 100 }));
	const floored = raw.map((r) => ({ ...r, floor: Math.floor(r.exact) }));
	let remainder = 100 - floored.reduce((s, r) => s + r.floor, 0);

	// Distribute remaining points to entries with largest fractional parts
	floored.sort((a, b) => (b.exact - b.floor) - (a.exact - a.floor));
	for (const entry of floored) {
		if (remainder <= 0) break;
		entry.floor += 1;
		remainder -= 1;
	}

	return Object.fromEntries(floored.map((r) => [r.key, r.floor]));
}

export const CATEGORY_CONFIG: Record<CitationCategory, { label: string; chartColor: string; badgeClass: string; chartDotClass: string }> = {
	brand: { label: "Brand", chartColor: "#10b981", badgeClass: "bg-green-500/90 text-white", chartDotClass: "bg-emerald-500" },
	competitor: { label: "Competitor", chartColor: "#ef4444", badgeClass: "bg-red-500/90 text-white", chartDotClass: "bg-red-500" },
	social_media: { label: "Social Media", chartColor: "#8b5cf6", badgeClass: "bg-purple-500/90 text-white", chartDotClass: "bg-violet-500" },
	google: { label: "Google", chartColor: "#4285f4", badgeClass: "bg-blue-500/90 text-white", chartDotClass: "bg-blue-500" },
	institutional: { label: "Institutional", chartColor: "#f59e0b", badgeClass: "bg-amber-500/90 text-white", chartDotClass: "bg-amber-500" },
	other: { label: "Other", chartColor: "#9ca3af", badgeClass: "bg-gray-500/90 text-white", chartDotClass: "bg-gray-400" },
};

export const DOMAIN_CATEGORY_COLORS: Record<string, string> = {
	brand: "#48bb78",
	competitor: "#f56565",
	social_media: "#7e56ee",
	google: "#4285f4",
	institutional: "#f59e0b",
	other: "#9ca3af",
};
