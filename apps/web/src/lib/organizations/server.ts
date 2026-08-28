/**
 * Kept out of `@/server/organizations`, which the client imports for its server
 * functions: anything exported there outright drags the database into the
 * client graph, while handler bodies are stripped.
 */
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { checkBrandCreate } from "@workspace/lib/entitlements";
import { asc, inArray } from "drizzle-orm";
import type { UserOrganization } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import type { BrandCreation, OrganizationSummary } from "@/lib/organizations/types";

const NOT_OFFERED: BrandCreation = { kind: "not-offered" };

async function resolveBrandCreation(orgIds: string[]): Promise<Map<string, BrandCreation>> {
	if (!getDeployment().features.canCreateBrands) return new Map(orgIds.map((orgId) => [orgId, NOT_OFFERED]));

	const decisions = await checkBrandCreate(orgIds);
	return new Map(
		orgIds.map((orgId) => {
			const decision = decisions.get(orgId);
			if (!decision) return [orgId, NOT_OFFERED];
			if (decision.allowed) return [orgId, { kind: "allowed" }];
			return [orgId, { kind: "denied", code: decision.code, message: decision.message }];
		}),
	);
}

/**
 * The summaries every organization surface renders, for one organization or for
 * all of a user's — the two lists are the same shape, so they are one query and
 * one shaper rather than a pair that can drift.
 *
 * The caller's role stays server-side: the server answers for itself what the
 * settings page may offer, and shipping the role would be a permission the
 * client could be tempted to read.
 */
export async function summarizeOrganizations(orgs: UserOrganization[]): Promise<OrganizationSummary[]> {
	if (orgs.length === 0) return [];
	const orgIds = orgs.map((org) => org.id);

	const [rows, creation] = await Promise.all([
		db
			.select({
				id: brands.id,
				slug: brands.slug,
				name: brands.name,
				website: brands.website,
				onboarded: brands.onboarded,
				organizationId: brands.organizationId,
			})
			.from(brands)
			.where(inArray(brands.organizationId, orgIds))
			// The order every list of them uses.
			.orderBy(asc(brands.name)),
		resolveBrandCreation(orgIds),
	]);

	return orgs.map((org) => ({
		id: org.id,
		slug: org.slug,
		name: org.name,
		brands: rows
			.filter((brand) => brand.organizationId === org.id)
			.map(({ id, slug, name, website, onboarded }) => ({ id, slug, name, website, onboarded })),
		brandCreation: creation.get(org.id) ?? NOT_OFFERED,
	}));
}
