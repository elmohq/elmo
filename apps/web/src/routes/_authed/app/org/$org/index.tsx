/**
 * /app/org/$org - Workspace home
 *
 * The brands this workspace owns. A workspace with none is a workspace that
 * hasn't been set up: where brands can be created from the UI that's a prompt to
 * create the first one, and where they can't (whitelabel, whose workspaces
 * arrive from Auth0 before anything is tracked) it's the onboarding wizard, with
 * the brand taking the workspace's own id as it always has.
 *
 * The workspace, its brands and its brand allowance all come from the layout
 * above, so the only thing this page fetches is the wizard's platform picks —
 * and only in the one state that shows the wizard.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { orgParams, orgSegment } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import BrandOnboarding from "@/components/brand-onboarding";
import FullPageCard from "@/components/full-page-card";
import { WorkspaceBrandList } from "@/components/workspace-brand-list";
import { buildTitle, getAppName } from "@/lib/route-head";
import type { WorkspaceSummary } from "@/lib/workspaces/types";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

/** The workspace has nothing in it and no way to add one from here — the wizard's state. */
function needsOnboarding(workspace: WorkspaceSummary): boolean {
	return workspace.brands.length === 0 && !workspace.canCreateBrand;
}

export const Route = createFileRoute("/_authed/app/org/$org/")({
	loader: async ({
		context,
	}): Promise<{ workspace: WorkspaceSummary; onboardingPlatformState: OnboardingPlatformState }> => ({
		// From the context the layout resolved, but returned here so the component
		// never renders against a `beforeLoad` that is mid-flight.
		workspace: context.workspace,
		onboardingPlatformState: needsOnboarding(context.workspace)
			? await getOnboardingPlatformStateFn({ data: { organizationId: context.workspace.id } })
			: null,
	}),
	head: ({ match }) => ({
		meta: [{ title: buildTitle("Workspace", { appName: getAppName(match) }) }],
	}),
	component: WorkspaceHomePage,
});

function WorkspaceHomePage() {
	const { workspace, onboardingPlatformState } = Route.useLoaderData();

	if (needsOnboarding(workspace)) {
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
			<div className="min-w-[200px] space-y-3">
				<WorkspaceBrandList workspace={workspace} />
				<Link
					to="/app/org/$org/settings"
					params={orgParams(workspace)}
					className={buttonVariants({ variant: "ghost", size: "sm", className: "w-full" })}
				>
					Workspace settings
				</Link>
			</div>
		</FullPageCard>
	);
}
