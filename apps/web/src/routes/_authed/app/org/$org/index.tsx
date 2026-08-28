/**
 * A workspace isn't a page you look at, so this leads to what you can change
 * about it. `/app` is where you pick one.
 *
 * The exception is a workspace Auth0 filled but nobody has set up, which gets
 * the wizard — with the brand taking the workspace's own id, as it always has.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { orgSegment } from "@workspace/lib/app-urls";
import BrandOnboarding from "@/components/brand-onboarding";
import type { WorkspaceSummary } from "@/lib/workspaces/types";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

/**
 * `brandLimit` separates "this deployment doesn't create brands" from "the plan
 * says not right now": the second is waiting on billing, not on setup, and the
 * wizard would be a dead end for it.
 */
function needsOnboarding(workspace: WorkspaceSummary): boolean {
	return workspace.brands.length === 0 && !workspace.canCreateBrand && !workspace.brandLimit;
}

export const Route = createFileRoute("/_authed/app/org/$org/")({
	loader: async ({
		context,
	}): Promise<{ workspace: WorkspaceSummary; onboardingPlatformState: OnboardingPlatformState }> => {
		if (!needsOnboarding(context.workspace)) {
			throw redirect({ to: "/app/org/$org/settings", params: { org: orgSegment(context.workspace) } });
		}

		return {
			workspace: context.workspace,
			onboardingPlatformState: await getOnboardingPlatformStateFn({
				data: { organizationId: context.workspace.id },
			}),
		};
	},
	component: WorkspaceOnboardingPage,
});

function WorkspaceOnboardingPage() {
	const { workspace, onboardingPlatformState } = Route.useLoaderData();

	return (
		<BrandOnboarding
			workspaceSlug={orgSegment(workspace)}
			brandId={workspace.id}
			brandName={workspace.name}
			platformState={onboardingPlatformState}
		/>
	);
}
