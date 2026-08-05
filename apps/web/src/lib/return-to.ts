/** Reject cross-origin returnTo values to prevent open redirects. */
export function safeReturnTo(returnTo: string | undefined): string {
	if (!returnTo) return "/app";
	if (returnTo.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
	// Keep this helper deterministic during SSR as well as in the browser. App
	// callers only need relative destinations, so absolute URLs are rejected
	// even when they happen to name the current origin.
	return "/app";
}
