import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { paywallQuery } from "@/lib/billing/queries";

export const Route = createFileRoute("/_authed/app")({
	beforeLoad: async ({ context }) => {
		const paywall = await context.queryClient.ensureQueryData({ ...paywallQuery, revalidateIfStale: true });
		if (paywall.needsPlan) {
			throw redirect({ to: "/choose-plan", search: { org: paywall.organizationId } });
		}
	},
	component: () => <Outlet />,
});
