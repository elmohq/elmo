import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { paywallQuery } from "@/lib/billing/queries";

export const Route = createFileRoute("/_authed/app")({
	beforeLoad: async ({ context }) => {
		// Cached the same way the viewer is in _authed: fresh answers cost no
		// round trip, stale ones refresh in the background.
		const paywall = await context.queryClient.ensureQueryData({ ...paywallQuery, revalidateIfStale: true });
		if (paywall.needsPlan) {
			throw redirect({ to: "/choose-plan", search: { org: paywall.organizationId } });
		}
	},
	component: () => <Outlet />,
});
