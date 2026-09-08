/**
 * Auth layout route - pathless layout that protects all child routes.
 *
 * Checks for an authenticated better-auth session, redirects to /auth/login if not found.
 * Owns the app shell for every signed-in page that has one, so the rail and
 * header survive a move between a brand, its organization, and the admin
 * section instead of being rebuilt by whichever layout was entered. Layouts
 * declare which shell they live in through `staticData.shell`; see
 * lib/shell-scope.ts.
 */

import { createFileRoute, Outlet, redirect, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { useEffect, useRef } from "react";
import { AppShell, PageContent } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { useShellScope } from "@/hooks/use-shell-scope";
import { identifyCrispUser } from "@/lib/crisp";
import { identifyUser, setPersonProperties, trackEvent } from "@/lib/posthog";
import { consumeVerificationPending } from "@/lib/signup-funnel";
import { viewerQuery } from "@/lib/viewer/queries";

export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ context, location }) => {
		const viewer = await context.queryClient.ensureQueryData({ ...viewerQuery, revalidateIfStale: true });

		if (!viewer) {
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

		// The demo signs every visitor in as one shared account. Identifying
		// them would fold every visitor into that one person and cut the trail
		// that began on the marketing site, so the demo stays anonymous.
		if (!context.clientConfig?.features.readOnly) {
			identifyUser(user.id, {
				email: user.email,
				name: user.name,
				deployment_mode: context.clientConfig?.mode,
			});
			setPersonProperties({
				deployment_mode: context.clientConfig?.mode,
			});
			const pending = consumeVerificationPending();
			if (pending) trackEvent("email_verified", { ref: pending.ref });
		}
		identifyCrispUser({ id: user.id, email: user.email, name: user.name });
	}, [context.session?.user, context.clientConfig?.mode, context.clientConfig?.features.readOnly]);

	return <Shell />;
}

function Shell() {
	const scope = useShellScope();

	if (!scope) return <Outlet />;

	return (
		<AppShell sidebar={<AppSidebar {...scope} />} header={<SiteHeader />}>
			{scope.section === "account" ? (
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
