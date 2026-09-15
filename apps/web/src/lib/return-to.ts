/**
 * Reject cross-origin returnTo values to prevent open redirects.
 *
 * Judged on the parsed origin rather than the shape of the string: a browser
 * normalizes `\` to `/` in an http(s) URL and strips tabs and newlines before
 * parsing, so `/\evil.com` reads as root-relative but lands elsewhere. The
 * path handed back is re-checked because normalization can collapse it to a
 * protocol-relative `//evil.com`, which escapes again on the way out.
 */
const RELATIVE_ONLY_ORIGIN = "https://return-to.invalid";

export function safeReturnTo(returnTo: string | undefined): string {
	if (!returnTo) return "/app";
	const origin = typeof window === "undefined" ? RELATIVE_ONLY_ORIGIN : window.location.origin;
	try {
		const url = new URL(returnTo, origin);
		if (url.origin !== origin) return "/app";
		const path = `${url.pathname}${url.search}${url.hash}`;
		return new URL(path, origin).origin === origin ? path : "/app";
	} catch {
		return "/app";
	}
}
