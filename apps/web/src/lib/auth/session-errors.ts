export const AUTHENTICATION_REQUIRED = "Unauthorized: Authentication required";

export class AuthenticationRequiredError extends Error {
	constructor() {
		super(AUTHENTICATION_REQUIRED);
		this.name = "AuthenticationRequiredError";
	}
}

let signingInAgain = false;

/** A full page load rather than a router navigation: everything cached in the
 *  browser belongs to the session that just ended. */
export function signInAgain(location: Pick<Location, "pathname" | "search" | "hash" | "assign"> = window.location) {
	if (signingInAgain) return;
	signingInAgain = true;
	const returnTo = `${location.pathname}${location.search}${location.hash}`;
	location.assign(`/auth/login?${new URLSearchParams({ returnTo })}`);
}
