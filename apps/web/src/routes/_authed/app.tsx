import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getPaywallStateFn } from "@/server/billing";

export const Route = createFileRoute("/_authed/app")({
	beforeLoad: async () => {
		const paywall = await getPaywallStateFn({ data: {} });
		if (paywall.needsPlan) {
			throw redirect({ to: "/choose-plan", search: { org: paywall.organizationId } });
		}
	},
	component: () => <Outlet />,
});
