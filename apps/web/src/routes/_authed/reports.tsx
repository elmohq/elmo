/**
 * /reports layout route
 *
 * Passthrough layout for the /reports section. Per-user access control is
 * handled at the page level; here we gate the whole subtree on the deployment
 * feature so cloud (report generation disabled) 404s every /reports/* route,
 * including the admin-accessible list and the render route.
 */
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/reports")({
	beforeLoad: ({ context }) => {
		if (context.clientConfig && !context.clientConfig.features.reportGeneration) {
			throw notFound();
		}
	},
	component: () => <Outlet />,
});
