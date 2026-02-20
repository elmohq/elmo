import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/admin/wizard-test")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/tools" });
	},
});
