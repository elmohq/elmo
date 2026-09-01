import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

/**
 * RFC 8252 §7.3, the redirect a CLI or desktop client listens on. A raw string
 * match, not a parsed hostname: the registration endpoint reads the authority
 * out of the literal URI too, so `http://127.1/cb` is a loopback address the
 * validator will still refuse.
 */
const HTTP_LOOPBACK_REDIRECT = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/?#]|$)/i;

/**
 * OpenID Connect Registration §2 defaults an omitted `application_type` to
 * `web`, and a web client may not redirect to loopback — so a client that never
 * declares a type is turned away for using the only redirect its platform can
 * receive. Reading those registrations as native costs nothing: a client that
 * asks for `web` is still held to https, and a public client still proves
 * itself with PKCE rather than with its redirect URI.
 */
export function nativeClientRegistrationDefault() {
	return {
		id: "native-client-registration-default",
		version: "1.0",
		hooks: {
			before: [
				{
					matcher: (ctx: { path?: string }) => ctx.path === "/oauth2/register",
					// A before hook gets a copy of the context; only what it returns is used.
					handler: createAuthMiddleware(async (ctx) => {
						const body = ctx.body as Record<string, unknown> | undefined;
						if (!body || body.application_type !== undefined) return;
						const redirectUris = body.redirect_uris;
						const allLoopback =
							Array.isArray(redirectUris) &&
							redirectUris.length > 0 &&
							redirectUris.every((uri) => typeof uri === "string" && HTTP_LOOPBACK_REDIRECT.test(uri));
						if (!allLoopback) return;
						return { context: { body: { ...body, application_type: "native" } } };
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}
