/**
 * Kept out of `@/server/organizations`, which the client imports for its server
 * functions: anything exported there outright drags the database into the
 * client graph, while handler bodies are stripped.
 */
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { checkBrandCreate } from "@workspace/lib/entitlements";
import { asc, eq } from "drizzle-orm";
import type { UserOrganization } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import type { OrganizationBrand, OrganizationSummary } from "@/lib/organizations/types";

type BrandCreation = Pick<OrganizationSummary, "canCreateBrand" | "brandLimit">;

/** Deployments that don't create brands from the UI at all, with no limit to explain. */
const NOT_OFFERED: BrandCreation = { canCreateBrand: false, brandLimit: null };

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

/** The brands an organization owns, in the order every list of them uses. */
export async function listOrganizationBrands(organizationId: string): Promise<OrganizationBrand[]> {
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
 * The caller's role stays server-side: the server answers for itself what the
 * settings page may offer, and shipping the role would be a permission the
 * client could be tempted to read.
 */
export async function withBrands(organization: UserOrganization): Promise<OrganizationSummary> {
	const [brandList, creation] = await Promise.all([
		listOrganizationBrands(organization.id),
		resolveBrandCreation([organization.id]),
	]);
	return {
		id: organization.id,
		slug: organization.slug,
		name: organization.name,
		brands: brandList,
		...(creation.get(organization.id) ?? NOT_OFFERED),
	};
}
