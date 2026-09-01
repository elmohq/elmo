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
 * MCP requires a client to declare `application_type` when it registers, and
 * OpenID Connect Registration §2 defaults an omitted one to `web` — which may
 * not redirect to loopback. A client that skips it is therefore turned away for
 * asking to be redirected to the machine it runs on, and no browser client asks
 * for that, so read the registration as the native one it is. A client that
 * says `web` is still held to https, and a public client still proves itself
 * with PKCE rather than with its redirect URI.
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
						if (!Array.isArray(redirectUris)) return;
						const wantsLoopback = redirectUris.some(
							(uri) => typeof uri === "string" && HTTP_LOOPBACK_REDIRECT.test(uri),
						);
						if (!wantsLoopback) return;
						return { context: { body: { ...body, application_type: "native" } } };
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}
