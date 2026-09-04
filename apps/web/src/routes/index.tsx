import { createFileRoute, redirect } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import FullPageCard from "@/components/full-page-card";
import { getSession } from "@/lib/auth/session";
import { entryRouteForVisitor } from "@/lib/entry-route";

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
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
