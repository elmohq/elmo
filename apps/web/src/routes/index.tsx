/**
 * Home page - / route
 *
 * Redirects authenticated users to /app.
 * Shows sign-in for unauthenticated users.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import FullPageCard from "@/components/full-page-card";
import { getSession } from "@/lib/auth/session";

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	beforeLoad: async () => {
		const session = await getSession();

		if (session) {
			throw redirect({ to: "/app" });
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
