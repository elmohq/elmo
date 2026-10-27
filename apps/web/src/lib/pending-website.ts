import { validateWebsiteUrl } from "@/lib/brand-website";

const STORAGE_KEY = "elmo:pending-website";

export function rememberPendingWebsite(website: string | undefined): void {
	if (!website || !validateWebsiteUrl(website).isValid) return;
	try {
		window.localStorage.setItem(STORAGE_KEY, website.trim());
	} catch {}
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
	} catch {}
}
