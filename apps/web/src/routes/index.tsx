/**
 * Home page - / route
 *
 * Sends authenticated visitors to /app and everyone else straight to the auth
 * page their deployment opens on (see entryRouteForVisitor), so the bare app
 * URL is never a card with a single button on it. Whitelabel, the one mode
 * with no such page, still gets the card.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import FullPageCard from "@/components/full-page-card";
import { getSession } from "@/lib/auth/session";
import { entryRouteForVisitor } from "@/lib/entry-route";

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
		/**
		 * Attribution tag carried by links back to us (see
		 * @workspace/config/referrals). Passed along so a click that lands on the
		 * bare app URL is still credited once we bounce it to sign-up.
		 */
		ref: typeof search.ref === "string" ? search.ref : undefined,
	}),
	beforeLoad: async ({ context, search }) => {
		const session = await getSession();

		if (session) {
			throw redirect({ to: "/app" });
		}

		const entryRoute = entryRouteForVisitor(context.clientConfig);
		if (entryRoute) {
			throw redirect({
				to: entryRoute,
				search: {
					...(search.redirect ? { returnTo: search.redirect } : {}),
					...(search.ref ? { ref: search.ref } : {}),
				},
			});
		}

		return { session };
	},
	component: HomePage,
});

function HomePage() {
	const { redirect: redirectParam } = Route.useSearch();

	const loginUrl = "/auth/login";
	const signInUrl = redirectParam ? `${loginUrl}?returnTo=${encodeURIComponent(redirectParam)}` : loginUrl;

	return (
		<FullPageCard className="">
			<a href={signInUrl} className={buttonVariants({})}>
				Sign In
			</a>
		</FullPageCard>
	);
}
