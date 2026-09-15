/**
 * Reject returnTo values that could leave the app, to prevent open redirects.
 * A browser reads `\` as `/` in an http(s) URL and strips tabs and newlines
 * before parsing, so `/\evil.com` and `/<tab>/evil.com` look root-relative but
 * navigate off-origin.
 */
export function safeReturnTo(returnTo: string | undefined): string {
	if (!returnTo) return "/app";
	const escapesApp = !returnTo.startsWith("/") || returnTo.startsWith("//") || /[\s\\]/.test(returnTo);
	return escapesApp ? "/app" : returnTo;
}
