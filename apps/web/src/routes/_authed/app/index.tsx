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
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { syncAuth0UserById } from "@workspace/whitelabel/auth-hooks";
import FullPageCard from "@/components/full-page-card";
import { requireAuthSession } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { brandParams, orgParams, workspacePath } from "@/lib/workspaces/paths";
import { listWorkspacesFn, type WorkspaceWithBrands } from "@/server/workspaces";

const getWorkspacePickerData = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ workspaces: WorkspaceWithBrands[]; canCreateBrands: boolean }> => {
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

		return { workspaces: await listWorkspacesFn(), canCreateBrands: deployment.features.canCreateBrands };
	},
);

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
	loader: async (): Promise<{ workspaces: WorkspaceWithBrands[]; canCreateBrands: boolean }> => {
		const data = await getWorkspacePickerData();

		// One workspace is no choice at all — and it is the common case, so the
		// picker would be a page users click through on the way to their work.
		if (data.workspaces.length === 1) {
			throw redirect({ to: "/app/org/$org", params: orgParams(data.workspaces[0]) });
		}

		return data;
	},
	component: WorkspacePickerPage,
});

function WorkspacePickerPage() {
	const { workspaces, canCreateBrands } = Route.useLoaderData();

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
						<div className="flex flex-col space-y-2">
							{workspace.brands.map((brand) => (
								<Button key={brand.id} asChild variant="secondary">
									<Link to="/app/org/$org/brand/$brand" params={brandParams(workspace, brand)}>
										{brand.name}
									</Link>
								</Button>
							))}
							{workspace.brands.length === 0 && (
								<Button asChild variant="outline">
									<Link to="/app/org/$org" params={orgParams(workspace)}>
										{canCreateBrands ? `Add a brand to ${workspace.name}` : `Set up ${workspace.name}`}
									</Link>
								</Button>
							)}
							{/* Per workspace: a plan's brand allowance is spent per workspace,
							    so the picker offers creation only where it would go through. */}
							{workspace.canCreateBrand && workspace.brands.length > 0 && (
								<Button asChild variant="outline">
									<Link to="/app/org/$org/new" params={orgParams(workspace)}>
										+ New brand
									</Link>
								</Button>
							)}
						</div>
					</div>
				))}
			</div>
		</FullPageCard>
	);
}
