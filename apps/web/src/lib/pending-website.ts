import { validateWebsiteUrl } from "@/lib/brand-website";

const STORAGE_KEY = "elmo:pending-website";

// Kept in localStorage rather than the URL: between the marketing-site link and
// the first brand form sit email verification, Google OAuth, and Stripe
// Checkout, and every one of those round trips drops our query parameters.

/** Hold on to a website a visitor arrived with, to offer it when they create their first brand. */
export function rememberPendingWebsite(website: string | undefined): void {
	if (!website || !validateWebsiteUrl(website).isValid) return;
	try {
		window.localStorage.setItem(STORAGE_KEY, website.trim());
	} catch {
		// Storage can be disabled; the visitor just types the website themselves.
	}
}

export function pendingWebsite(): string | null {
	try {
		return window.localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

export function forgetPendingWebsite(): void {
	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Nothing to clean up when storage is unavailable.
	}
}
