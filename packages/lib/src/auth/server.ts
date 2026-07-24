/**
 * Better-auth server factory.
 *
 * Central auth configuration shared by all deployment modes.
 * Exports a factory function so deployment-specific hooks (e.g. whitelabel
 * Auth0 org sync, cloud webhook handlers) can be injected.
 */

import { type SSOOptions, sso } from "@better-auth/sso";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, customSession, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
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
			organization(options?.organizationOptions),
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
				const s = session as Record<string, unknown>;
				let activeOrganizationId = (s.activeOrganizationId as string | null | undefined) ?? null;
				if (!activeOrganizationId) {
					const [m] = await db
						.select({ orgId: schema.member.organizationId })
						.from(schema.member)
						.where(eq(schema.member.userId, user.id))
						.limit(1);
					activeOrganizationId = m?.orgId ?? null;
				}
				return {
					user: {
						...user,
						role: (u.role as string) ?? "user",
						hasReportGeneratorAccess: u.hasReportGeneratorAccess === true,
					},
					session: { ...session, activeOrganizationId },
				};
			}),
			tanstackStartCookies(),
		],
	});
}

export type Auth = ReturnType<typeof createAuth>;
