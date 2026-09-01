/**
 * Better-auth server factory.
 *
 * Central auth configuration shared by all deployment modes.
 * Exports a factory function so deployment-specific hooks (e.g. whitelabel
 * Auth0 org sync, cloud webhook handlers) can be injected.
 */

import { apiKey } from "@better-auth/api-key";
import { type SSOOptions, sso } from "@better-auth/sso";
import { type BetterAuthOptions, type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	admin,
	customSession,
	mcp,
	oAuthDiscoveryMetadata,
	oAuthProtectedResourceMetadata,
	organization,
} from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
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
 * The page an MCP client's user lands on: it signs them in if they aren't, asks
 * whether to allow the client, and only then hands the request to
 * `/api/auth/mcp/authorize`, which is what turns a session into an OAuth code.
 *
 * It is advertised as the authorization endpoint *and* configured as the
 * plugin's login page, so it is reached whether a client follows the metadata
 * or goes straight to the plugin without a session.
 */
export const MCP_AUTHORIZE_PAGE = "/auth/authorize";

/** Where the MCP endpoint is served, and what its resource identifier names. */
export const MCP_PATH = "/api/mcp";

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
				loginPage: MCP_AUTHORIZE_PAGE,
				resource: `${origin}${MCP_PATH}`,
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
 * The two OAuth discovery documents, as request handlers.
 *
 * Re-exported here rather than imported from better-auth at the call site: the
 * app depends on this package for auth, not on the library directly, and these
 * belong beside the plugin whose metadata they serve.
 */
export { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata };
