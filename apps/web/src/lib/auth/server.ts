/**
 * Auth instance for the web app.
 *
 * Created once at module scope using the shared factory from @workspace/lib,
 * with deployment-specific options injected based on DEPLOYMENT_MODE.
 *
 * This is the single source of truth for the server-side auth object.
 * All server functions, middleware, and route handlers import from here.
 */
import { getCloudAuthOptions } from "@workspace/deployment/auth-hooks/cloud";
import { getWhitelabelAuthOptions } from "@workspace/deployment/auth-hooks/whitelabel";
import { type CreateAuthOptions, createAuth } from "@workspace/lib/auth/server";
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
							throw new Error("This instance is already bootstrapped. Sign in with the existing account instead.");
						}
					},
					after: async (user) => {
						await provisionLocalOrg({ userId: user.id });
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
			// Demo deployments authenticate only the provisioned demo user.
			return { disableSignUp: true };
		case "cloud": {
			// Full cloud auth stack (email verification, Google OAuth, Resend
			// transactional email, team invitations, disposable-domain blocking,
			// invite-only allowlist, and umbrella-org provisioning). The cloud
			// package owns the entire hook chain — this case is a single call.
			return getCloudAuthOptions();
		}
		default:
			return getLocalAuthOptions();
	}
}

export const auth = createAuth(getDeploymentAuthOptions());
