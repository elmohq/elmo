/**
 * Better-auth server factory.
 *
 * Central auth configuration shared by all deployment modes.
 * Exports a factory function so deployment-specific hooks (e.g. whitelabel
 * Auth0 org sync, cloud webhook handlers) can be injected.
 */

import { apiKey } from "@better-auth/api-key";
import { mcp } from "@better-auth/mcp";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { type SSOOptions, sso } from "@better-auth/sso";
import { MCP_PATH } from "@workspace/config/constants";
import { type BetterAuthOptions, type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import {
	createDpopReplayStore,
	enforceDpopBinding,
	parseAccessTokenAuthorization,
	verifyJwsAccessToken,
} from "better-auth/oauth2";
import { admin, customSession, jwt, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { JWTPayload } from "jose";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { ac, adminRole, memberRole, ownerRole, userRole } from "./permissions";

export interface CreateAuthOptions {
	databaseHooks?: BetterAuthOptions["databaseHooks"];
	sso?: SSOOptions;
	trustedOrigins?: string[];
	/** Set to false to disable email/password auth (e.g. whitelabel SSO-only). */
	emailAndPasswordEnabled?: boolean;
	/** Override better-auth's default minimum password length (8). */
	minPasswordLength?: number;
	/**
	 * Reject POST /api/auth/sign-up/email at the better-auth layer.
	 * Used by demo (no user-initiated signup at all) and whitelabel (SSO only).
	 * Local mode keeps this false and enforces "first signup only" via a
	 * `databaseHooks.user.create.before` guard instead.
	 */
	disableSignUp?: boolean;
	/** Require verified email before email/password sign-in (cloud). */
	requireEmailVerification?: boolean;
	/** Top-level better-auth emailVerification config (send callback, sendOnSignUp, ...). */
	emailVerification?: BetterAuthOptions["emailVerification"];
	/** Password-reset email sender, threaded into emailAndPassword. */
	sendResetPassword?: NonNullable<BetterAuthOptions["emailAndPassword"]>["sendResetPassword"];
	/** OAuth providers (e.g. Google in cloud). */
	socialProviders?: BetterAuthOptions["socialProviders"];
	/** Options for the organization plugin (e.g. sendInvitationEmail in cloud). */
	organizationOptions?: Parameters<typeof organization>[0];
	/**
	 * Deployment-specific plugins appended to the shared set (e.g. cloud's
	 * Stripe billing plugin). Any plugin that adds schema must also be added to
	 * the schema-generation helper (scripts/generate-auth-schema.sh) so
	 * schema-auth.ts keeps its tables.
	 */
	extraPlugins?: BetterAuthPlugin[];
}

/**
 * Where an MCP client's user is asked whether to allow it. The plugin sends a
 * signed-in browser here with the authorization request in the query, and this
 * page hands that query back to the consent endpoint on a click.
 */
export const MCP_AUTHORIZE_PAGE = "/auth/authorize";

/**
 * Where the plugin sends a browser that has no session yet.
 *
 * The app's own sign-in page, not a step of our own: the auth client sends the
 * signed authorization query along with the sign-in request, so the plugin
 * finishes the authorize it was in the middle of and answers with where to go
 * next. Bouncing through a `returnTo` instead would mean rebuilding that query,
 * and a query rebuilt is a signature broken.
 */
const LOGIN_PAGE = "/auth/login";

/**
 * The resource identifier an MCP access token is bound to.
 *
 * Rejected before the plugin sees it so the failure names the setting that
 * caused it: the plugin throws a `TypeError` about resource URLs, which is a
 * hard startup failure for the whole app when all the operator did was point
 * `APP_URL` at a plain-HTTP hostname.
 */
function mcpResource(origin: string): string {
	const { protocol, hostname } = new URL(origin);
	const octets = hostname.split(".");
	const isLoopbackIpv4 =
		octets.length === 4 && octets[0] === "127" && octets.every((octet) => /^\d+$/.test(octet) && Number(octet) <= 255);
	if (protocol !== "https:" && !(hostname === "localhost" || hostname === "[::1]" || isLoopbackIpv4)) {
		throw new Error(
			`APP_URL must be an HTTPS URL (or localhost) to serve MCP: an access token is bound to ${origin}${MCP_PATH}, and MCP clients refuse a resource identifier that isn't. Got ${origin}.`,
		);
	}
	return `${origin}${MCP_PATH}`;
}

/**
 * Name the resource on an authorization request that left it out.
 *
 * RFC 8707's `resource` is what binds a token to the server it is for, and it
 * is also what decides the token's shape: without it the plugin issues an
 * opaque string instead of a signed JWT, and `/api/mcp` — which verifies
 * against the published key set — has no way to read one. There is exactly one
 * protected resource behind this authorization server, so filling in the
 * parameter a client omitted grants nothing it was not already asking for.
 *
 * The default lands before the plugin signs the query, so it survives the login
 * and consent round trips and is still on the authorization code the client
 * redeems — which is why the token endpoint needs no matching default.
 */
function mcpResourceDefault(resource: string) {
	return {
		id: "mcp-resource-default",
		version: "1.0",
		hooks: {
			before: [
				{
					matcher: (ctx: { path?: string }) => ctx.path === "/oauth2/authorize",
					// Returned rather than assigned: a before hook is handed a copy of
					// the context, and only what it returns reaches the endpoint.
					handler: createAuthMiddleware(async (ctx) => {
						const body = ctx.body as Record<string, unknown> | undefined;
						if (ctx.query?.resource || body?.resource) return;
						return {
							context: {
								query: { ...ctx.query, resource },
								...(body && { body: { ...body, resource } }),
							},
						};
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}

export function createAuth(options?: CreateAuthOptions) {
	const appUrl = process.env.APP_URL || process.env.VITE_APP_URL;
	if (!appUrl) {
		throw new Error("APP_URL or VITE_APP_URL must be set for Better Auth");
	}

	const localOrigin =
		process.env.NODE_ENV !== "production" ? `http://localhost:${process.env.PORT ?? "3000"}` : undefined;
	const baseURL = localOrigin ?? appUrl;

	// No trailing slash: everything below concatenates paths onto it.
	const origin = baseURL.replace(/\/$/, "");
	const resource = mcpResource(origin);

	const origins = options?.trustedOrigins ?? [];
	if (!origins.includes(appUrl)) {
		origins.push(appUrl);
	}
	if (localOrigin && !origins.includes(localOrigin)) {
		origins.push(localOrigin);
	}

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",
			schema,
		}),
		secret: process.env.BETTER_AUTH_SECRET,
		baseURL,
		basePath: "/api/auth",
		trustedOrigins: origins,

		emailAndPassword: {
			enabled: options?.emailAndPasswordEnabled !== false,
			requireEmailVerification: options?.requireEmailVerification === true,
			...(options?.minPasswordLength !== undefined && {
				minPasswordLength: options.minPasswordLength,
			}),
			...(options?.disableSignUp === true && { disableSignUp: true }),
			...(options?.sendResetPassword && { sendResetPassword: options.sendResetPassword }),
		},
		...(options?.emailVerification && { emailVerification: options.emailVerification }),
		...(options?.socialProviders && { socialProviders: options.socialProviders }),

		user: {
			additionalFields: {
				hasReportGeneratorAccess: {
					type: "boolean",
					required: false,
					defaultValue: false,
					input: false,
				},
			},
		},

		session: {
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60,
				strategy: "compact",
			},
		},

		databaseHooks: options?.databaseHooks,

		plugins: [
			organization({
				ac,
				roles: { owner: ownerRole, admin: ownerRole, member: memberRole },
				...options?.organizationOptions,
			}),
			// Keys belong to the organization, not to whoever pressed the button:
			// `referenceId` is the org id and the plugin refuses to mint a key for
			// one the caller isn't a member of, checking the `apiKey` statement on
			// their org role. Scopes ride in `permissions`, which the plugin treats
			// as server-only — so a key can only be created through a server
			// function, never from a browser.
			apiKey({
				references: "organization",
				defaultPrefix: "elmo_",
				enableMetadata: true,
				// Generous on purpose: this exists to stop a runaway loop from
				// saturating the database, not to meter normal use. A nightly
				// analytics pull costs a few dozen requests; exporting a brand's
				// answer text costs one per run, which is hundreds of thousands for
				// a large workspace. At 120/min that export took a day.
				//
				// The limit is stamped onto each key when it is created, not read
				// from here per request — raising this later does nothing for keys
				// already issued.
				rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 1_000 },
			}),
			admin({
				ac,
				roles: {
					admin: adminRole,
					user: userRole,
				},
			}),
			// Signs the access tokens the MCP authorization server issues, and
			// publishes the key set they are verified against. `mcp()` requires it:
			// without it tokens fall back to being signed with a client secret,
			// which a public client does not have.
			//
			// Left to itself the plugin also stamps a freshly signed JWT onto every
			// session read, which means decrypting the signing key on the path the
			// `customSession` below is deliberately kept cheap for. Nothing here
			// reads that header, so it is off.
			jwt({ disableSettingJwtHeader: true }),
			mcpResourceDefault(resource),
			// The OAuth authorization server behind /api/mcp. An MCP client
			// registers itself, sends its user here to sign in, and leaves with a
			// token that acts as that person — the same reach they have in the
			// dashboard, no more.
			//
			// `resource` is the protected resource identifier a client checks its
			// token audience against, so it names the MCP endpoint rather than the
			// origin the plugin would default to. It is built from the same
			// `baseURL` the plugin advertises as the authorization server — naming
			// the two differently is what makes a strict client refuse to connect
			// against a local instance.
			mcp({
				loginPage: LOGIN_PAGE,
				consentPage: MCP_AUTHORIZE_PAGE,
				resource,
				// Registration is off by default, and an MCP client that has never
				// met this instance has no other way to introduce itself: it has no
				// session to register under and no secret to register with. Both
				// switches are needed for that — the first opens /oauth2/register,
				// the second lets an unauthenticated caller reach it. PKCE is what
				// stands in for the missing secret, and the plugin requires it of
				// every public client without being asked.
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
			}),
			sso(options?.sso),
			...(options?.extraPlugins ?? []),
			// Replaces the /get-session endpoint, so this runs on every session
			// read — including cookie-cache hits, which otherwise touch no
			// database. Keep it free of queries.
			customSession(async ({ user, session }) => {
				const u = user as Record<string, unknown>;
				return {
					user: {
						...user,
						role: (u.role as string) ?? "user",
						hasReportGeneratorAccess: u.hasReportGeneratorAccess === true,
					},
					session,
				};
			}),
			tanstackStartCookies(),
		],
	});
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Identity for the cached key set, so a verification reads the keys from the
 * database at most once every few minutes rather than once per request.
 */
const jwksCacheKey = {};

/**
 * The claims of the MCP access token a request carries. Throws if it has none,
 * or if what it has is not one this server issued for `/api/mcp`.
 *
 * The token is a JWT the authorization server signed, so this is a signature
 * check against that key set followed by the two questions that make the
 * signature mean something here: was it minted by this server, and was it
 * minted for `/api/mcp`. A token this instance issued for some other resource
 * is a valid signature that must not open this door.
 *
 * The keys are read through `auth.api` rather than fetched from the `jwks_uri`
 * the discovery document advertises, because that URL is the address clients
 * reach the app on and the app has no way to reach itself there: behind a
 * container's published port, or a proxy, it names something that is not this
 * process. That is the one reason this is assembled from the library's pieces
 * rather than being `verifyAccessTokenRequest`, which only takes a URL to fetch
 * keys from; every check it makes is made here, by the same functions.
 */
export async function verifyMcpAccessToken(auth: Auth, request: Request): Promise<JWTPayload> {
	const authorization = parseAccessTokenAuthorization(request.headers.get("authorization"));
	if (!authorization?.token || authorization.scheme === "Unknown") {
		throw new Error("no Bearer or DPoP access token");
	}

	// The resolved base URL carries the auth base path, which is what the plugin
	// stamps as `iss`. The resource identifier names the MCP endpoint at the
	// origin instead, which is a different string on purpose.
	const { baseURL, internalAdapter } = await auth.$context;
	const origin = new URL(baseURL).origin;
	const payload = await verifyJwsAccessToken(authorization.token, {
		jwksFetch: () => auth.api.getJwks(),
		jwksCacheKey,
		verifyOptions: { issuer: baseURL, audience: `${origin}${MCP_PATH}` },
	});

	// RFC 9449. A client that binds its token to a key proves it holds that key
	// on every call, which is what makes a stolen token useless — so the proof is
	// checked rather than the token refused. This also settles the scheme both
	// ways: a bound token spent as a bearer token is refused, and so is `DPoP`
	// over a token that was never bound.
	//
	// The URL is rebuilt on the configured origin because that is the one the
	// client signed into `htu`. What the request says can be the address inside a
	// container or in front of a proxy, and a proof is not wrong for having been
	// signed against the address the client was told to use.
	await enforceDpopBinding({
		payload,
		authorization,
		proofJwt: request.headers.get("dpop"),
		method: request.method,
		url: new URL(new URL(request.url).pathname, origin).toString(),
		// Backed by the database, so a proof replayed against another instance
		// finds its own `jti` already spent.
		replayStore: createDpopReplayStore(internalAdapter),
	});
	return payload;
}

/**
 * The authorization-server discovery document, as a request handler.
 *
 * Re-exported here rather than imported from the plugin package at the call
 * site: the app depends on this package for auth, not on the library directly,
 * and this belongs beside the plugin whose metadata it serves. The
 * protected-resource document has no such export — the plugin answers it from
 * the request itself, so the route that places it at its RFC path hands the
 * request back to `auth.handler`.
 */
export { MCP_PATH, oauthProviderAuthServerMetadata };
