/**
 * /app/org/$org - Workspace home
 *
 * The brands this workspace owns. A workspace with none is a workspace that
 * hasn't been set up: where brands can be created from the UI that's a prompt to
 * create the first one, and where they can't (whitelabel, whose workspaces
 * arrive from Auth0 before anything is tracked) it's the onboarding wizard, with
 * the brand taking the workspace's own id as it always has.
 *
 * Whether another brand can be created costs an entitlements read, which the
 * layout deliberately doesn't carry — so this page, one of the few that offers
 * creation, asks for it here.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { orgParams, orgSegment } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { z } from "zod";
import BrandOnboarding from "@/components/brand-onboarding";
import FullPageCard from "@/components/full-page-card";
import { WorkspaceBrandList } from "@/components/workspace-brand-list";
import { requireAuthSession, requireOrganization } from "@/lib/auth/helpers";
import { buildTitle, getAppName } from "@/lib/route-head";
import { canCreateBrandIn, countWorkspaceBrands } from "@/lib/workspaces/server";
import type { WorkspaceSummary } from "@/lib/workspaces/types";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

interface WorkspaceHomeData {
	canCreateBrand: boolean;
	/**
	 * The wizard's platform picks, for the one state that needs them: a
	 * workspace with no brands that cannot create one from the UI.
	 */
	onboardingPlatformState: OnboardingPlatformState;
}

const getWorkspaceHome = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	.handler(async ({ data }): Promise<WorkspaceHomeData> => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);

		const [canCreateBrand, brandCount] = await Promise.all([
			canCreateBrandIn(workspace.id),
			countWorkspaceBrands(workspace.id),
		]);
		return {
			canCreateBrand,
			onboardingPlatformState:
				brandCount === 0 && !canCreateBrand
					? await getOnboardingPlatformStateFn({ data: { organizationId: workspace.id } })
					: null,
		};
	});

export const Route = createFileRoute("/_authed/app/org/$org/")({
	loader: async ({ params, context }): Promise<WorkspaceHomeData & { workspace: WorkspaceSummary }> => ({
		...(await getWorkspaceHome({ data: { org: params.org } })),
		// From the context the layout resolved, but returned here so the component
		// never renders against a `beforeLoad` that is mid-flight.
		workspace: context.workspace,
	}),
	head: ({ match }) => ({
		meta: [{ title: buildTitle("Workspace", { appName: getAppName(match) }) }],
	}),
	component: WorkspaceHomePage,
});

function WorkspaceHomePage() {
	const { workspace, canCreateBrand, onboardingPlatformState } = Route.useLoaderData();

	if (workspace.brands.length === 0 && !canCreateBrand) {
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
				<WorkspaceBrandList workspace={{ ...workspace, canCreateBrand }} />
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
