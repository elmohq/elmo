/**
 * Server-side workspace reads shared by the route loaders.
 *
 * Kept out of `@/server/workspaces` because that module is imported by the
 * client for its server functions: anything it exports outright drags the
 * database into the client graph, while what these route handlers call is
 * stripped along with the handler bodies.
 */
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { checkBrandCreate } from "@workspace/lib/entitlements";
import { asc, eq } from "drizzle-orm";
import { requireOrganization } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import type { WorkspaceBrand, WorkspaceWithBrands } from "@/lib/workspaces/types";

/**
 * Whether each of these workspaces can take another brand. Deployments that
 * don't create brands from the UI at all answer no without asking the plan.
 */
export async function decideBrandCreation(orgIds: string[]): Promise<Map<string, boolean>> {
	if (!getDeployment().features.canCreateBrands) return new Map(orgIds.map((orgId) => [orgId, false]));
	const decisions = await checkBrandCreate(orgIds);
	return new Map(orgIds.map((orgId) => [orgId, decisions.get(orgId)?.allowed ?? false]));
}

/** The brands a workspace owns, in the order every list of them uses. */
async function listWorkspaceBrands(organizationId: string): Promise<WorkspaceBrand[]> {
	return db
		.select({ id: brands.id, name: brands.name, onboarded: brands.onboarded })
		.from(brands)
		.where(eq(brands.organizationId, organizationId))
		.orderBy(asc(brands.name));
}

/**
 * The workspace an `/app/$org` page belongs to, with everything the shell
 * around it renders: its name, its brands, and whether another brand can be
 * added. The layouts load this so the rail is complete on first paint and stays
 * usable if the switcher's all-workspaces query fails.
 */
export async function loadWorkspaceWithBrands(userId: string, org: string): Promise<WorkspaceWithBrands> {
	const workspace = await requireOrganization(userId, org);
	const [workspaceBrands, canCreate] = await Promise.all([
		listWorkspaceBrands(workspace.id),
		decideBrandCreation([workspace.id]),
	]);
	return { ...workspace, brands: workspaceBrands, canCreateBrand: canCreate.get(workspace.id) ?? false };
}
