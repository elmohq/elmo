/** Reject returnTo values that could leave the app, to prevent open redirects. */
export function safeReturnTo(returnTo: string | undefined): string {
	if (!returnTo) return "/app";
	const escapesApp = !returnTo.startsWith("/") || returnTo.startsWith("//") || /[\s\\]/.test(returnTo);
	return escapesApp ? "/app" : returnTo;
}
