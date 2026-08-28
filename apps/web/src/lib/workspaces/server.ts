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
import { asc, count, eq } from "drizzle-orm";
import type { UserOrganization } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import type { WorkspaceBrand, WorkspaceSummary } from "@/lib/workspaces/types";

/**
 * Whether each of these workspaces can take another brand. Deployments that
 * don't create brands from the UI at all answer no without asking the plan.
 *
 * Costs an entitlements read, so it is asked for by the pages that offer brand
 * creation rather than resolved with the workspace on every navigation.
 */
export async function decideBrandCreation(orgIds: string[]): Promise<Map<string, boolean>> {
	if (!getDeployment().features.canCreateBrands) return new Map(orgIds.map((orgId) => [orgId, false]));
	const decisions = await checkBrandCreate(orgIds);
	return new Map(orgIds.map((orgId) => [orgId, decisions.get(orgId)?.allowed ?? false]));
}

export async function canCreateBrandIn(organizationId: string): Promise<boolean> {
	return (await decideBrandCreation([organizationId])).get(organizationId) ?? false;
}

/** The brands a workspace owns, in the order every list of them uses. */
export async function listWorkspaceBrands(organizationId: string): Promise<WorkspaceBrand[]> {
	return db
		.select({
			id: brands.id,
			slug: brands.slug,
			name: brands.name,
			website: brands.website,
			onboarded: brands.onboarded,
		})
		.from(brands)
		.where(eq(brands.organizationId, organizationId))
		.orderBy(asc(brands.name));
}

/** How many brands a workspace owns, for the pages that only need the number. */
export async function countWorkspaceBrands(organizationId: string): Promise<number> {
	const [row] = await db.select({ value: count() }).from(brands).where(eq(brands.organizationId, organizationId));
	return row?.value ?? 0;
}

/** A resolved workspace with the brands it owns. Two indexed reads, no more. */
export async function withBrands(workspace: UserOrganization): Promise<WorkspaceSummary> {
	return { ...workspace, brands: await listWorkspaceBrands(workspace.id) };
}
