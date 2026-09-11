/**
 * Authentication middleware for TanStack Start
 *
 * Provides user session and deployment context to server functions.
 *
 * Access-control decisions are delegated to pure policy functions
 * in `@/lib/auth/policies` so they can be tested independently.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getDeployment } from "@workspace/deployment";
import { auth } from "@/lib/auth/server";

/**
 * Auth middleware - provides deployment context to all server functions.
 * Does NOT enforce authentication; server functions check `session` themselves.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
	const deployment = getDeployment();
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });

	return next({
		context: {
			session,
			deployment,
		},
	});
});
