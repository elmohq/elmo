/**
 * Better-auth server factory.
 *
 * Central auth configuration shared by all deployment modes.
 * Exports a factory function so deployment-specific hooks (e.g. whitelabel
 * Auth0 org sync, cloud webhook handlers) can be injected.
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin, customSession } from "better-auth/plugins";
import { sso, type SSOOptions } from "@better-auth/sso";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { ac, adminRole, userRole } from "./permissions";

export interface CreateAuthOptions {
	databaseHooks?: BetterAuthOptions["databaseHooks"];
	sso?: SSOOptions;
	trustedOrigins?: string[];
	/** Set to false to disable email/password auth (e.g. whitelabel SSO-only). */
	emailAndPasswordEnabled?: boolean;
	/** Override better-auth's default minimum password length (8). */
	minPasswordLength?: number;
}

/**
 * Strip paths, query, and trailing slashes so the entry matches Better Auth's
 * internal comparison (which goes through `new URL(...).origin`). Without this,
 * an APP_URL like "https://demo.example.com/" silently mismatches the browser's
 * "https://demo.example.com" Origin header and the sign-in POST returns 403.
 * Returns the raw input on parse failure so validation errors still surface.
 */
function normalizeOrigin(value: string): string {
	try {
		return new URL(value).origin;
	} catch {
		return value;
	}
}

export function createAuth(options?: CreateAuthOptions) {
	const appUrl = process.env.APP_URL || process.env.VITE_APP_URL;
	if (!appUrl) {
		throw new Error("APP_URL or VITE_APP_URL must be set for Better Auth");
	}

	const localOrigin = process.env.NODE_ENV !== "production"
		? `http://localhost:${process.env.PORT ?? "3000"}`
		: undefined;
	const baseURL = normalizeOrigin(localOrigin ?? appUrl);

	const origins = new Set<string>();
	for (const raw of options?.trustedOrigins ?? []) origins.add(normalizeOrigin(raw));
	origins.add(normalizeOrigin(appUrl));
	if (localOrigin) origins.add(normalizeOrigin(localOrigin));

	// Extra origins for deployments behind multiple domains (e.g. Railway preview URLs
	// alongside a custom domain). Comma-separated so a single env var covers all hosts.
	const extraOrigins = process.env.TRUSTED_ORIGINS;
	if (extraOrigins) {
		for (const entry of extraOrigins.split(",")) {
			const trimmed = entry.trim();
			if (trimmed) origins.add(normalizeOrigin(trimmed));
		}
	}

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",
			schema,
		}),
		secret: process.env.BETTER_AUTH_SECRET,
		baseURL,
		basePath: "/api/auth",
		trustedOrigins: [...origins],

		emailAndPassword: {
			enabled: options?.emailAndPasswordEnabled !== false,
			requireEmailVerification: false,
			...(options?.minPasswordLength !== undefined && {
				minPasswordLength: options.minPasswordLength,
			}),
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
