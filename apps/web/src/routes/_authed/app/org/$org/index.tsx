/**
 * /app/org/$org - Workspace home
 *
 * The brands this workspace owns. A workspace with none is a workspace that
 * hasn't been set up: where brands can be created from the UI that's a prompt to
 * create the first one, and where they can't (whitelabel, whose workspaces
 * arrive from Auth0 before anything is tracked) it's the onboarding wizard, with
 * the brand taking the workspace's own id as it always has.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { orgParams, orgSegment } from "@workspace/lib/app-urls";
import { Button } from "@workspace/ui/components/button";
import BrandOnboarding from "@/components/brand-onboarding";
import FullPageCard from "@/components/full-page-card";
import { WorkspaceBrandList } from "@/components/workspace-brand-list";
import { buildTitle, getAppName } from "@/lib/route-head";
import type { WorkspaceWithBrands } from "@/lib/workspaces/types";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

export const Route = createFileRoute("/_authed/app/org/$org/")({
	loader: async ({
		context,
	}): Promise<{ workspace: WorkspaceWithBrands; onboardingPlatformState: OnboardingPlatformState }> => {
		const { workspace } = context;
		// A workspace that can't create brands and hasn't got one is a whitelabel
		// workspace waiting to be onboarded, which is the only state that needs the
		// wizard's platform picks.
		const needsFirstBrand = workspace.brands.length === 0 && !workspace.canCreateBrand;
		return {
			workspace,
			onboardingPlatformState: needsFirstBrand
				? await getOnboardingPlatformStateFn({ data: { organizationId: workspace.id } })
				: null,
		};
	},
	head: ({ match }) => ({
		meta: [{ title: buildTitle("Workspace", { appName: getAppName(match) }) }],
	}),
	component: WorkspaceHomePage,
});

function WorkspaceHomePage() {
	const { workspace, onboardingPlatformState } = Route.useLoaderData();

	if (workspace.brands.length === 0 && !workspace.canCreateBrand) {
		return (
			<BrandOnboarding
				workspaceSlug={orgSegment(workspace)}
				brandId={workspace.id}
				brandName={workspace.name}
				platformState={onboardingPlatformState}
			/>
		);
	}

	return (
		<FullPageCard
			title={workspace.name}
			subtitle={workspace.brands.length > 0 ? "Select a brand to get started" : "This workspace has no brands yet"}
		>
			<div className="flex min-w-[200px] flex-col space-y-3">
				<WorkspaceBrandList workspace={workspace} />
				<Button asChild variant="ghost" size="sm">
					<Link to="/app/org/$org/settings" params={orgParams(workspace)}>
						Workspace settings
					</Link>
				</Button>
			</div>
		</FullPageCard>
	);
}
