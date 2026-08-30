/**
 * Kept out of `@/server/organizations`, which the client imports: handler bodies
 * are stripped from that module, but anything exported outright would drag the
 * database into the client graph.
 */
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { checkBrandCreate } from "@workspace/lib/entitlements";
import { inArray } from "drizzle-orm";
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
			.where(inArray(brands.organizationId, orgIds)),
		resolveBrandCreation(orgIds),
	]);

	return orgs.map((org) => ({
		id: org.id,
		slug: org.slug,
		name: org.name,
		// Sorted here rather than in SQL so it doesn't depend on the deployment's
		// collation — `ORDER BY name` under LC_COLLATE=C is byte order, which puts
		// every capitalized name ahead of every lowercase one.
		brands: rows
			.filter((brand) => brand.organizationId === org.id)
			.map(({ id, slug, name, website, onboarded }) => ({ id, slug, name, website, onboarded }))
			.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
		brandCreation: creation.get(org.id) ?? NOT_OFFERED,
	}));
}
