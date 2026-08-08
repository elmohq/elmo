/**
 * /app layout route
 *
 * Checks the paywall (cloud only) before rendering any /app child route.
 * Every page under /app inherits this gate — no per-route sprinkling needed.
 * The /choose-plan route lives outside this layout so unentitled users can
 * still reach it.
 */
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getPaywallStateFn } from "@/server/billing";

export const Route = createFileRoute("/_authed/app")({
	beforeLoad: async () => {
		const paywall = await getPaywallStateFn();
		if (paywall.needsPlan) {
			throw redirect({ to: "/choose-plan" });
		}
	},
	component: () => <Outlet />,
});