/**
 * /app/$org - Workspace home
 *
 * The brands this workspace owns. A workspace with none is a workspace that
 * hasn't been set up: where brands can be created from the UI that's a prompt to
 * create the first one, and where they can't (whitelabel, whose workspaces
 * arrive from Auth0 before anything is tracked) it's the onboarding wizard, with
 * the brand taking the workspace's own id as it always has.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { Button } from "@workspace/ui/components/button";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import BrandOnboarding from "@/components/brand-onboarding";
import FullPageCard from "@/components/full-page-card";
import { requireAuthSession, requireOrganization } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { buildTitle, getAppName } from "@/lib/route-head";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

interface WorkspaceHome {
	workspace: { id: string; slug: string; name: string };
	brands: { id: string; name: string }[];
	canCreateBrands: boolean;
}

const getWorkspaceHome = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	.handler(async ({ data }): Promise<WorkspaceHome> => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);

		const rows = await db
			.select({ id: brands.id, name: brands.name })
			.from(brands)
			.where(eq(brands.organizationId, workspace.id))
			.orderBy(asc(brands.name));

		return {
			workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
			brands: rows,
			canCreateBrands: getDeployment().features.canCreateBrands,
		};
	});

export const Route = createFileRoute("/_authed/app/$org/")({
	loader: async ({ params }): Promise<WorkspaceHome & { onboardingPlatformState: OnboardingPlatformState }> => {
		const home = await getWorkspaceHome({ data: { org: params.org } });
		const needsFirstBrand = home.brands.length === 0 && !home.canCreateBrands;
		return {
			...home,
			onboardingPlatformState: needsFirstBrand
				? await getOnboardingPlatformStateFn({ data: { organizationId: home.workspace.id } })
				: null,
		};
	},
	head: ({ match }) => ({
		meta: [{ title: buildTitle("Workspace", { appName: getAppName(match) }) }],
	}),
	component: WorkspaceHomePage,
});

function WorkspaceHomePage() {
	const { workspace, brands: brandList, canCreateBrands, onboardingPlatformState } = Route.useLoaderData();

	if (brandList.length === 0 && !canCreateBrands) {
		return (
			<BrandOnboarding
				workspaceSlug={workspace.slug}
				brandId={workspace.id}
				brandName={workspace.name}
				platformState={onboardingPlatformState}
			/>
		);
	}

	return (
		<FullPageCard
			title={workspace.name}
			subtitle={brandList.length > 0 ? "Select a brand to get started" : "This workspace has no brands yet"}
		>
			<div className="flex min-w-[200px] flex-col space-y-3">
				{brandList.map((brand) => (
					<Button key={brand.id} asChild variant="secondary">
						<Link to="/app/$org/$brand" params={{ org: workspace.slug, brand: brand.id }}>
							{brand.name}
						</Link>
					</Button>
				))}
				{canCreateBrands && (
					<Button asChild variant={brandList.length > 0 ? "outline" : "default"}>
						<Link to="/app/$org/new" params={{ org: workspace.slug }}>
							{brandList.length > 0 ? "+ Create new brand" : "Create your first brand"}
						</Link>
					</Button>
				)}
				<Button asChild variant="ghost" size="sm">
					<Link to="/app/$org/settings" params={{ org: workspace.slug }}>
						Workspace settings
					</Link>
				</Button>
			</div>
		</FullPageCard>
	);
}
