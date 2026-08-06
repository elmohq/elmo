/** Reject cross-origin returnTo values to prevent open redirects. */
export function safeReturnTo(returnTo: string | undefined): string {
	if (!returnTo) return "/app";
	if (returnTo.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
	try {
		const url = new URL(returnTo, window.location.origin);
		if (url.origin !== window.location.origin) return "/app";
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return "/app";
	}
}
