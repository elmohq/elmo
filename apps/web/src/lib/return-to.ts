/**
 * Reject cross-origin returnTo values to prevent open redirects.
 *
 * Every value goes through the URL parser, because the shape of the string is
 * not what the browser navigates to: `\` is normalized to `/` in an http(s)
 * URL, and tabs and newlines are stripped before parsing. So `/\evil.com` and
 * `/<tab>/evil.com` both look root-relative and both land on another origin.
 * The parsed origin is the only thing worth trusting.
 */

/** Stands in for the real origin off the browser, where there isn't one. A
 *  relative path resolves against it; anything absolute lands elsewhere and is
 *  refused, which is the safe answer when there is nothing to compare to. */
const RELATIVE_ONLY_ORIGIN = "https://return-to.invalid";

export function safeReturnTo(returnTo: string | undefined): string {
	if (!returnTo) return "/app";
	const origin = typeof window === "undefined" ? RELATIVE_ONLY_ORIGIN : window.location.origin;
	try {
		const url = new URL(returnTo, origin);
		if (url.origin !== origin) return "/app";
		// Re-serialized from the parse, so what the caller navigates to is what
		// was judged here rather than the string that was handed in.
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return "/app";
	}
}
