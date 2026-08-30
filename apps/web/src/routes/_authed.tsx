/**
 * Auth layout route - pathless layout that protects all child routes.
 *
 * Checks for an authenticated better-auth session, redirects to /auth/login if not found.
 */

import { createFileRoute, Outlet, redirect, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { useEffect, useRef } from "react";
import { identifyCrispUser } from "@/lib/crisp";
import { identifyUser, setPersonProperties } from "@/lib/posthog";
import { getViewerFn } from "@/server/viewer";

export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ location }) => {
		const viewer = await getViewerFn();

		if (!viewer) {
			throw redirect({
				to: "/auth/login",
				search: { returnTo: location.href },
			});
		}

		return viewer;
	},
	component: AuthedLayout,
});

function AuthedLayout() {
	const context = useRouteContext({ strict: false }) as {
		session?: { user: { id: string; name?: string; email?: string } } | null;
		clientConfig?: ClientConfig;
	};
	const identifiedRef = useRef<string | null>(null);

	useEffect(() => {
		const user = context.session?.user;
		if (!user || identifiedRef.current === user.id) return;
		identifiedRef.current = user.id;

		identifyUser(user.id, {
			email: user.email,
			name: user.name,
			deployment_mode: context.clientConfig?.mode,
		});
		setPersonProperties({
			deployment_mode: context.clientConfig?.mode,
		});
		identifyCrispUser({ id: user.id, email: user.email, name: user.name });
	}, [context.session?.user, context.clientConfig?.mode]);

	return <Outlet />;
}
