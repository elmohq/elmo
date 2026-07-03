/**
 * Better-auth server factory.
 *
 * Central auth configuration shared by all deployment modes.
 * Exports a factory function so deployment-specific hooks (e.g. whitelabel
 * Auth0 org sync, cloud webhook handlers) can be injected.
 */

import { apiKey } from "@better-auth/api-key";
import { type SSOOptions, sso } from "@better-auth/sso";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, customSession, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { ac, adminRole, userRole } from "./permissions";

/**
 * Per-key rate limit applied to external API keys. The plugin default
 * (10 requests/day) is unusable for a real API; keys get a generous
 * per-minute budget instead. Adjustable per key server-side later.
 */
export const API_KEY_RATE_LIMIT_TIME_WINDOW_MS = 60 * 1000;
export const API_KEY_RATE_LIMIT_MAX_REQUESTS = 120;

/** Prefix on generated keys so they are identifiable in logs/secret scanners. */
export const API_KEY_PREFIX = "elmo_";

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
}

export function createAuth(options?: CreateAuthOptions) {
	const appUrl = process.env.APP_URL || process.env.VITE_APP_URL;
	if (!appUrl) {
		throw new Error("APP_URL or VITE_APP_URL must be set for Better Auth");
	}

	const localOrigin =
		process.env.NODE_ENV !== "production" ? `http://localhost:${process.env.PORT ?? "3000"}` : undefined;
	const baseURL = localOrigin ?? appUrl;

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
			requireEmailVerification: false,
			...(options?.minPasswordLength !== undefined && {
				minPasswordLength: options.minPasswordLength,
			}),
			...(options?.disableSignUp === true && { disableSignUp: true }),
		},

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
			organization(),
			admin({
				ac,
				roles: {
					admin: adminRole,
					user: userRole,
				},
			}),
			// External API keys (/api/v1 auth). Keys are hashed at rest; only the
			// first few characters are stored for display. Keys never act as app
			// sessions (`enableSessionForAPIKeys` stays false) — they are resolved
			// explicitly by the /api/v1 auth layer, which derives authority from
			// the owning user's role and org memberships at request time.
			apiKey({
				defaultPrefix: API_KEY_PREFIX,
				requireName: true,
				enableMetadata: true,
				rateLimit: {
					enabled: true,
					timeWindow: API_KEY_RATE_LIMIT_TIME_WINDOW_MS,
					maxRequests: API_KEY_RATE_LIMIT_MAX_REQUESTS,
				},
			}),
			sso(options?.sso),
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
