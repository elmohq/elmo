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

function getDeploymentAuthOptions(): CreateAuthOptions | undefined {
	switch (process.env.DEPLOYMENT_MODE) {
		case "whitelabel":
			return getWhitelabelAuthOptions();
		default:
			return undefined;
	}
}

export const auth = createAuth(getDeploymentAuthOptions());
