/**
 * Auth instance for the web app.
 *
 * Created once at module scope using the shared factory from @workspace/lib,
 * with deployment-specific options injected based on DEPLOYMENT_MODE.
 *
 * This is the single source of truth for the server-side auth object.
 * All server functions, middleware, and route handlers import from here.
 */
import { createAuth, type CreateAuthOptions } from "@workspace/lib/auth/server";
import { getWhitelabelAuthOptions } from "@workspace/whitelabel/auth-hooks";
import { countUsers, provisionLocalOrg } from "@workspace/lib/db/provisioning";

/**
 * Local mode hooks: enforce "exactly one user, with an admin org created
 * atomically on signup". The `before` hook rejects any signup once a user
 * exists; the `after` hook creates the organization and membership.
 *
 * Also applies to direct POST /api/auth/sign-up/email calls — the hooks
 * fire regardless of whether signup is triggered from our UI or a curl.
 */
function getLocalAuthOptions(): CreateAuthOptions {
	return {
		databaseHooks: {
			user: {
				create: {
					before: async () => {
						if ((await countUsers()) > 0) {
							throw new Error(
								"This instance is already bootstrapped. Sign in with the existing account instead.",
							);
						}
					},
					after: async (user) => {
						await provisionLocalOrg({
							userId: user.id,
							workspaceName: user.name,
						});
					},
				},
			},
		},
	};
}

function getDeploymentAuthOptions(): CreateAuthOptions | undefined {
	switch (process.env.DEPLOYMENT_MODE) {
		case "whitelabel":
			return getWhitelabelAuthOptions();
		case "demo":
			// Seeded demo user has a 4-char password; allow it only here.
			// Signup is disabled — demo users are created by the seed script,
			// never by visitors.
			return { minPasswordLength: 4, disableSignUp: true };
		default:
			return getLocalAuthOptions();
	}
}

export const auth = createAuth(getDeploymentAuthOptions());
