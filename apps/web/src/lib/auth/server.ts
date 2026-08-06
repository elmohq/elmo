/**
 * Auth instance for the web app.
 *
 * Created once at module scope using the shared factory from @workspace/lib,
 * with deployment-specific options injected based on DEPLOYMENT_MODE.
 *
 * This is the single source of truth for the server-side auth object.
 * All server functions, middleware, and route handlers import from here.
 */
import { getCloudAuthOptions } from "@workspace/cloud/auth-hooks";
import { createAuth, type CreateAuthOptions } from "@workspace/lib/auth/server";
import { getWhitelabelAuthOptions } from "@workspace/whitelabel/auth-hooks";
import { countUsers, provisionLocalOrg } from "@workspace/lib/db/provisioning";
import { evaluateSignupAllowed, getSignupAllowlist } from "./policies";

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
			// Signup is disabled. Demo deployments reuse a database previously
			// bootstrapped in local mode; visitors can only sign in as that
			// pre-existing user.
			return { disableSignUp: true };
		case "cloud": {
			// Full cloud auth stack (email verification, Google OAuth, Resend
			// transactional email, team invitations, disposable-domain blocking).
			// The invite-only signup allowlist is layered onto the cloud package's
			// user.create.before hook so both gates run on every signup path
			// (email/password, OAuth first-login, direct POST /api/auth/sign-up/email),
			// unlike the UI's canRegister flag. Set CLOUD_SIGNUP_ALLOWLIST to admit
			// people ("@elmohq.com,alice@x.com"); empty denies everyone (fails
			// closed); "*" opens it up at launch. Sign-in is unaffected — create
			// hooks don't fire for existing users. Each user provisions their own
			// org via the create-brand flow (canCreateBrands), so no after hook.
			const cloudOptions = getCloudAuthOptions();
			const rejectDisposableEmail = cloudOptions.databaseHooks?.user?.create?.before;
			return {
				...cloudOptions,
				databaseHooks: {
					...cloudOptions.databaseHooks,
					user: {
						...cloudOptions.databaseHooks?.user,
						create: {
							...cloudOptions.databaseHooks?.user?.create,
							before: async (user, context) => {
								if (evaluateSignupAllowed(user.email, getSignupAllowlist()) === "deny") {
									throw new Error("Sign-ups are invite-only right now.");
								}
								await rejectDisposableEmail?.(user, context);
							},
						},
					},
				},
			};
		}
		default:
			return getLocalAuthOptions();
	}
}

export const auth = createAuth(getDeploymentAuthOptions());
