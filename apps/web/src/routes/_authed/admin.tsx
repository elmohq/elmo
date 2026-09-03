/**
 * /admin layout - Admin section with access control
 *
 * Checks admin status; returns 404 if not admin.
 */
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/admin")({
	staticData: { crumb: "Admin", nav: "admin" },
	beforeLoad: ({ context }) => {
		if (!context.isAdmin) throw notFound();
	},
	component: () => <Outlet />,
});
