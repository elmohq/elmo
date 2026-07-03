/**
 * Better-auth client instance.
 *
 * Used in browser code for session management, organization switching,
 * permission checks, and SSO flows.
 */
import { apiKeyClient } from "@better-auth/api-key/client";
import { ssoClient } from "@better-auth/sso/client";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, adminRole, userRole } from "./permissions";

export const authClient = createAuthClient({
	baseURL: typeof window !== "undefined" ? window.location.origin : "",
	basePath: "/api/auth",
	plugins: [
		organizationClient(),
		adminClient({
			ac,
			roles: {
				admin: adminRole,
				user: userRole,
			},
		}),
		ssoClient(),
		apiKeyClient(),
	],
});

export type AuthClient = typeof authClient;
