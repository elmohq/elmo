const RELATIVE_PATH_BASE = "https://relative-path.invalid";

/** Accept only paths that a browser resolves inside the current application. */
export function isSafeRelativePath(value: string): boolean {
	if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return false;
	try {
		return new URL(value, RELATIVE_PATH_BASE).origin === RELATIVE_PATH_BASE;
	} catch {
		return false;
	}
}

/** Reject cross-origin returnTo values to prevent open redirects. */
export function safeReturnTo(returnTo: string | undefined): string {
	if (!returnTo) return "/app";
	if (isSafeRelativePath(returnTo)) return returnTo;
	// Keep this helper deterministic during SSR as well as in the browser. App
	// callers only need relative destinations, so absolute URLs are rejected
	// even when they happen to name the current origin.
	return "/app";
}
