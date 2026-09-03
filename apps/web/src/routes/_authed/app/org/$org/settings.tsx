import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/org/$org/settings")({
	staticData: { nav: "organization" },
	component: () => <Outlet />,
});
