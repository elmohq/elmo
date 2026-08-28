/**
 * Renders for everyone, one-workspace deployments included: it is the only page
 * that lists what exists, so stepping aside would leave the mark that points
 * here landing on a workspace's settings.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { syncAuth0UserById } from "@workspace/whitelabel/auth-hooks";
import FullPageCard from "@/components/full-page-card";
import { WorkspaceDirectory } from "@/components/workspace-directory";
import { requireAuthSession } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { buildTitle, getAppName } from "@/lib/route-head";
import { listWorkspacesFn, type WorkspaceSummary } from "@/server/workspaces";

const getWorkspacePickerData = createServerFn({ method: "GET" }).handler(async (): Promise<WorkspaceSummary[]> => {
	const deployment = getDeployment();

	if (deployment.mode === "whitelabel") {
		const session = await requireAuthSession();
		// Keep /app usable during Auth0 Management API incidents; background sync will reconcile memberships later.
		try {
			await syncAuth0UserById(session.user.id);
		} catch (error) {
			console.error("[auth0-sync] Failed to sync user on /app load; continuing with cached memberships", error);
		}
	}

	return listWorkspacesFn();
});

function WorkspacePickerSkeleton() {
	return (
		<FullPageCard title="" subtitle="">
			<div className="flex min-w-[200px] flex-col space-y-3">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		</FullPageCard>
	);
}

export const Route = createFileRoute("/_authed/app/")({
	pendingComponent: WorkspacePickerSkeleton,
	loader: (): Promise<WorkspaceSummary[]> => getWorkspacePickerData(),
	head: ({ match }) => ({
		meta: [
			{ title: buildTitle("Workspaces and Brands", { appName: getAppName(match) }) },
			{ name: "description", content: "Modify workspaces or navigate to brands." },
		],
	}),
	component: WorkspacePickerPage,
});

function WorkspacePickerPage() {
	const workspaces = Route.useLoaderData();

	if (workspaces.length === 0) {
		return (
			<FullPageCard title="No workspaces" subtitle="Your account isn't a member of a workspace yet.">
				<p className="text-center text-muted-foreground">Ask an admin to invite you, then reload this page.</p>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="Workspaces and Brands" subtitle="Modify workspaces or navigate to brands.">
			<WorkspaceDirectory workspaces={workspaces} />
		</FullPageCard>
	);
}
