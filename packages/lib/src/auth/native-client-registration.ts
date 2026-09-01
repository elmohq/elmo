import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

/**
 * RFC 8252 §7.3, the redirect a CLI or desktop client listens on. A raw string
 * match, not a parsed hostname: the registration endpoint reads the authority
 * out of the literal URI too, so `http://127.1/cb` is a loopback address the
 * validator will still refuse.
 */
const HTTP_LOOPBACK_REDIRECT = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/?#]|$)/i;

function isLoopbackHost(hostname: string): boolean {
	return hostname === "localhost" || hostname === "[::1]" || /^127(\.\d{1,3}){3}$/.test(hostname);
}

/** The two redirects RFC 8252 gives a native app: a loopback port, or a claimed https URL. */
function usableByNativeClient(uri: unknown): boolean {
	if (typeof uri !== "string") return false;
	if (HTTP_LOOPBACK_REDIRECT.test(uri)) return true;
	try {
		const url = new URL(uri);
		return url.protocol === "https:" && !isLoopbackHost(url.hostname);
	} catch {
		return false;
	}
}

/**
 * MCP requires a client to declare `application_type` when it registers, and
 * OpenID Connect Registration §2 defaults an omitted one to `web` — which may
 * not redirect to loopback. A client that skips the field is turned away for
 * asking to be redirected to the machine it runs on, and that is the only
 * address a CLI can listen on.
 *
 * So infer the type from what the client asked for, and register the redirects
 * that type can actually use: RFC 7591 §3.2.1 lets the server substitute
 * metadata values, and the registration response tells the client which ones it
 * kept. Dropping the rest is what admits a client that bundles a desktop
 * deeplink its vendor never made well-formed. A client that declares its own
 * type is left exactly as it asked, and is still held to https if it says
 * `web`.
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
						// No browser client asks to be sent back to the user's own machine.
						if (!redirectUris.some((uri) => typeof uri === "string" && HTTP_LOOPBACK_REDIRECT.test(uri))) return;
						return {
							context: {
								body: {
									...body,
									application_type: "native",
									redirect_uris: redirectUris.filter(usableByNativeClient),
								},
							},
						};
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}
