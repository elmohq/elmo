/**
 * Better-auth client instance.
 *
 * Used in browser code for session management, organization switching,
 * permission checks, and SSO flows.
 */

import { ssoClient } from "@better-auth/sso/client";
import { stripeClient } from "@better-auth/stripe/client";
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
		// The subscription endpoints exist only in cloud mode (the server plugin
		// is injected there); no cloud UI calls these methods elsewhere.
		stripeClient({ subscription: true }),
	],
});

export type AuthClient = typeof authClient;
