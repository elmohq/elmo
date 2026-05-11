/**
 * Home page - / route
 *
 * Redirects authenticated users to /app.
 * In demo mode, auto-redirects unauthenticated users to /auth/login
 * (the login page pre-fills the demo credentials, so the bare home page
 * is just a redundant extra click).
 * On a fresh local deployment (no users yet), redirects to /auth/register
 * so the first visitor sees the signup screen instead of login.
 * Shows sign-in for unauthenticated users in other modes.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import FullPageCard from "@/components/full-page-card";
import { getSession } from "@/lib/auth/session";

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	beforeLoad: async ({ context, search }) => {
		const session = await getSession();

		if (session) {
			throw redirect({ to: "/app" });
		}

		if (context.clientConfig?.mode === "demo") {
			throw redirect({
				to: "/auth/login",
				search: search.redirect ? { returnTo: search.redirect } : {},
			});
		}

		if (context.clientConfig?.canRegister) {
			throw redirect({
				to: "/auth/register",
				search: search.redirect ? { returnTo: search.redirect } : {},
			});
		}

		return { session };
	},
	component: HomePage,
});

function HomePage() {
	const { redirect: redirectParam } = Route.useSearch();

	const loginUrl = "/auth/login";
	const signInUrl = redirectParam
		? `${loginUrl}?returnTo=${encodeURIComponent(redirectParam)}`
		: loginUrl;

	return (
		<FullPageCard className="">
			<Button asChild>
				<a href={signInUrl}>Sign In</a>
			</Button>
		</FullPageCard>
	);
}
