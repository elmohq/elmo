/**
 * Auth layout route - pathless layout that protects all child routes.
 *
 * Checks for an authenticated better-auth session, redirects to /auth/login if not found.
 */
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth/session";

export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ location }) => {
		const session = await getSession();

		if (!session) {
			throw redirect({
				to: "/auth/login",
				search: { returnTo: location.href },
			});
		}

		return { session };
	},
	component: () => <Outlet />,
});
