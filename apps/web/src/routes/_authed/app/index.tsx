/**
 * /app - Workspace picker
 *
 * Every workspace the user belongs to, each with its brands. Most deployments
 * give a user exactly one, so this page steps aside for them; whitelabel users
 * can belong to several Auth0-synced workspaces, and a cloud user picks up more
 * by accepting team invitations.
 */

import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { orgParams, workspacePath } from "@workspace/lib/app-urls";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { syncAuth0UserById } from "@workspace/whitelabel/auth-hooks";
import FullPageCard from "@/components/full-page-card";
import { WorkspaceBrandList } from "@/components/workspace-brand-list";
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
	loader: async (): Promise<WorkspaceSummary[]> => {
		const workspaces = await getWorkspacePickerData();

		// One workspace is no choice at all — and it is the common case, so the
		// picker would be a page users click through on the way to their work.
		if (workspaces.length === 1) {
			throw redirect({ to: "/app/org/$org", params: orgParams(workspaces[0]) });
		}

		return workspaces;
	},
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle("Your workspaces", { appName }) },
				{ name: "description", content: "Pick a workspace, then a brand inside it." },
			],
		};
	},
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
		<FullPageCard title="Your workspaces" subtitle="Pick a workspace, then a brand inside it">
			<div className="flex min-w-[280px] flex-col gap-6">
				{workspaces.map((workspace) => (
					<div key={workspace.id} className="space-y-2">
						<div className="flex items-baseline justify-between gap-3">
							<Link to="/app/org/$org" params={orgParams(workspace)} className="font-medium hover:underline">
								{workspace.name}
							</Link>
							<span className="text-xs text-muted-foreground">{workspacePath(workspace)}</span>
						</div>
						<WorkspaceBrandList workspace={workspace} />
					</div>
				))}
			</div>
		</FullPageCard>
	);
}
