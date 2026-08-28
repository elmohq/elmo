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
import type { UserOrganization } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import type { WorkspaceBrand, WorkspaceSummary } from "@/lib/workspaces/types";

type BrandCreation = Pick<WorkspaceSummary, "canCreateBrand" | "brandLimit">;

/** Deployments that don't create brands from the UI at all, with no limit to explain. */
const NOT_OFFERED: BrandCreation = { canCreateBrand: false, brandLimit: null };

/**
 * Whether each of these workspaces can take another brand, and the plan's
 * reason where it refuses.
 */
export async function resolveBrandCreation(orgIds: string[]): Promise<Map<string, BrandCreation>> {
	if (!getDeployment().features.canCreateBrands) return new Map(orgIds.map((orgId) => [orgId, NOT_OFFERED]));

	const decisions = await checkBrandCreate(orgIds);
	return new Map(
		orgIds.map((orgId) => {
			const decision = decisions.get(orgId);
			if (!decision) return [orgId, NOT_OFFERED];
			return [
				orgId,
				{
					canCreateBrand: decision.allowed,
					brandLimit: decision.allowed ? null : { code: decision.code, message: decision.message },
				},
			];
		}),
	);
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

/**
 * A resolved workspace with the brands it owns and its brand allowance.
 *
 * The caller's role stays server-side: it decides what the settings page offers,
 * which the server answers for itself, and shipping it to every page would be a
 * permission the client could be tempted to read.
 */
export async function withBrands(workspace: UserOrganization): Promise<WorkspaceSummary> {
	const [brandList, creation] = await Promise.all([
		listWorkspaceBrands(workspace.id),
		resolveBrandCreation([workspace.id]),
	]);
	return {
		id: workspace.id,
		slug: workspace.slug,
		name: workspace.name,
		brands: brandList,
		...(creation.get(workspace.id) ?? NOT_OFFERED),
	};
}
