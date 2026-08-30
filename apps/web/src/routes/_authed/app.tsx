/**
 * The user-level half of the paywall (cloud only): a user whose every
 * organization is unsubscribed has nowhere under /app to go, so they are sent
 * to pick a plan for their own. The per-organization half lives in the brand
 * layout, which is the first route that knows which one is being looked at.
 *
 * /choose-plan sits outside this layout so an unentitled user can still reach it.
 */
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
