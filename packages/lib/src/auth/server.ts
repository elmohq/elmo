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
import { nativeClientRegistrationDefault } from "./native-client-registration";
import { ac, adminRole, memberRole, ownerRole, userRole } from "./permissions";

export interface CreateAuthOptions {
	databaseHooks?: BetterAuthOptions["databaseHooks"];
	sso?: SSOOptions;
	trustedOrigins?: string[];
	emailAndPasswordEnabled?: boolean;
	minPasswordLength?: number;
	disableSignUp?: boolean;
	requireEmailVerification?: boolean;
	emailVerification?: BetterAuthOptions["emailVerification"];
	sendResetPassword?: NonNullable<BetterAuthOptions["emailAndPassword"]>["sendResetPassword"];
	socialProviders?: BetterAuthOptions["socialProviders"];
	organizationOptions?: Parameters<typeof organization>[0];
	/** A plugin adding schema must also go in scripts/generate-auth-schema.sh. */
	extraPlugins?: BetterAuthPlugin[];
}

export const MCP_AUTHORIZE_PAGE = "/auth/authorize";

const LOGIN_PAGE = "/auth/login";

/** Checked here so the failure names APP_URL rather than the plugin's TypeError. */
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
 * Without an RFC 8707 `resource` the plugin issues an opaque token instead of a
 * JWT. There is one resource here, so filling it in grants nothing the client
 * was not already asking for.
 */
function mcpResourceDefault(resource: string) {
	return {
		id: "mcp-resource-default",
		version: "1.0",
		hooks: {
			before: [
				{
					matcher: (ctx: { path?: string }) => ctx.path === "/oauth2/authorize",
					// A before hook gets a copy of the context; only what it returns is used.
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
			// `permissions` is server-only to the plugin, so scopes cannot be set
			// from a browser.
			apiKey({
				references: "organization",
				defaultPrefix: "elmo_",
				enableMetadata: true,
				// Stamped onto each key at creation, so raising it does nothing for
				// keys already issued.
				rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 1_000 },
			}),
			admin({
				ac,
				roles: {
					admin: adminRole,
					user: userRole,
				},
			}),
			// Required by mcp(): a public client has no secret to sign tokens with.
			// The header would otherwise sign a JWT on every session read.
			jwt({ disableSettingJwtHeader: true }),
			mcpResourceDefault(resource),
			nativeClientRegistrationDefault(),
			mcp({
				loginPage: LOGIN_PAGE,
				consentPage: MCP_AUTHORIZE_PAGE,
				resource,
				// A client that has never met this instance has no secret to register
				// with; PKCE stands in for one.
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
			}),
			sso(options?.sso),
			...(options?.extraPlugins ?? []),
			// Runs on every session read, including cookie-cache hits. Keep it free
			// of queries.
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

/** Cache identity, so the key set is read once every few minutes. */
const jwksCacheKey = {};

/**
 * `verifyAccessTokenRequest`, but reading the keys through `auth.api`: it only
 * fetches them from `jwks_uri`, which names the address clients reach the app
 * on, not one the app can reach itself.
 */
export async function verifyMcpAccessToken(auth: Auth, request: Request): Promise<JWTPayload> {
	const authorization = parseAccessTokenAuthorization(request.headers.get("authorization"));
	if (!authorization?.token || authorization.scheme === "Unknown") {
		throw new Error("no Bearer or DPoP access token");
	}

	const { baseURL, internalAdapter } = await auth.$context;
	const origin = new URL(baseURL).origin;
	const payload = await verifyJwsAccessToken(authorization.token, {
		jwksFetch: () => auth.api.getJwks(),
		jwksCacheKey,
		verifyOptions: { issuer: baseURL, audience: `${origin}${MCP_PATH}` },
	});

	// A no-op for a token carrying no `cnf`. The URL is rebuilt on the configured
	// origin because that is what the client signed into `htu`; the request's own
	// can be an address behind a proxy.
	await enforceDpopBinding({
		payload,
		authorization,
		proofJwt: request.headers.get("dpop"),
		method: request.method,
		url: new URL(new URL(request.url).pathname, origin).toString(),
		// Database-backed, so a replay against another instance is caught.
		replayStore: createDpopReplayStore(internalAdapter),
	});
	return payload;
}

export { MCP_PATH, oauthProviderAuthServerMetadata };
