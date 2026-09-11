/**
 * W3C change-password-url + RFC 8615: GET /.well-known/change-password must
 * redirect (302/303/307) to the in-app page that changes an existing password.
 * Password-manager probes hit this exact path; 404 would mean "unsupported".
 */
export const CHANGE_PASSWORD_PATH = "/change-password";

/** Shipped GET handler for `/.well-known/change-password`. */
export function handleWellKnownChangePasswordGet({ request }: { request: Request }): Response {
	const location = new URL(CHANGE_PASSWORD_PATH, request.url).pathname;
	return new Response(null, {
		status: 302,
		headers: { Location: location },
	});
}
