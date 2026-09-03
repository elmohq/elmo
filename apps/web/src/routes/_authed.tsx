/**
 * Auth layout route - pathless layout that protects all child routes.
 *
 * Checks for an authenticated better-auth session, redirects to /auth/login if not found.
 * Owns the app shell for every signed-in page that has one, so the rail and
 * header survive a move between a brand, its organization, and the admin
 * section instead of being rebuilt by whichever layout was entered. Layouts
 * declare the rail they want through `staticData.nav`; see lib/app-chrome.ts.
 */

import { createFileRoute, Outlet, redirect, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { useEffect, useRef } from "react";
import { AppShell, PageContent } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { useAppChrome } from "@/hooks/use-app-chrome";
import { identifyCrispUser } from "@/lib/crisp";
import { identifyUser, setPersonProperties } from "@/lib/posthog";
import { viewerQuery } from "@/lib/viewer/queries";

export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ context, location }) => {
		// This guard runs before every navigation. The query cache answers it
		// without a round trip while the last answer is fresh and refreshes it in
		// the background once it is stale, the way /app/org/$org already reads
		// the organization list.
		const viewer = await context.queryClient.ensureQueryData({ ...viewerQuery, revalidateIfStale: true });

		if (!viewer) {
			// A signed-out answer must not outlive the sign-in that follows it.
			context.queryClient.removeQueries({ queryKey: viewerQuery.queryKey });
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

	return <AppChrome />;
}

function AppChrome() {
	const chrome = useAppChrome();

	if (!chrome) return <Outlet />;

	return (
		<AppShell sidebar={<AppSidebar {...chrome} />} header={<SiteHeader />}>
			{/* The plan gate lays its own page out edge to edge. */}
			{chrome.nav === "account" ? (
				<div className="flex flex-1 flex-col">
					<Outlet />
				</div>
			) : (
				<PageContent>
					<Outlet />
				</PageContent>
			)}
		</AppShell>
	);
}
