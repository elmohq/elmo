import { createFileRoute, redirect } from "@tanstack/react-router";
import { FORWARDED_PARAMS } from "@workspace/config/signup-attribution";
import { buttonVariants } from "@workspace/ui/components/button";
import FullPageCard from "@/components/full-page-card";
import { getSession } from "@/lib/auth/session";
import { entryRouteForVisitor } from "@/lib/entry-route";

// The redirect below happens on the server, so a campaign's tags only reach the
// page that records them if they are carried across it. Values pass through as
// the router parsed them (a campaign named "2026" is a number) so they
// serialize back to what arrived.
function campaignParams(search: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(FORWARDED_PARAMS.flatMap((key) => (key in search ? [[key, search[key]]] : [])));
}

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
		ref: typeof search.ref === "string" ? search.ref : undefined,
	}),
	beforeLoad: async ({ context, location, search }) => {
		const session = await getSession();

		if (session) {
			throw redirect({ to: "/app" });
		}

		const entryRoute = entryRouteForVisitor(context.clientConfig);
		if (entryRoute) {
			throw redirect({
				to: entryRoute,
				search: {
					...campaignParams(location.search),
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
