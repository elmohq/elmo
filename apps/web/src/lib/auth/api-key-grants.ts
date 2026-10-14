/**
 * The reach of an organization key: which brands, and whether the person who
 * issued it still belongs to the organization. Read by both the API's
 * authentication and the pages that list keys, so the two cannot disagree.
 */
import { db } from "@workspace/lib/db/db";
import { apiKeyBrands, apiKeyGrants, brands, member, user } from "@workspace/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export interface ApiKeyGrant {
	/** Null reaches every brand in the organization; `[]` reaches none. */
	brandIds: string[] | null;
	createdBy: { id: string; name: string } | null;
	/** A key stops authenticating once its issuer leaves the organization. Keys
	 * issued before issuers were recorded have no one to leave. */
	issuerIsMember: boolean;
}

/** Keys with no grant row are absent from the map, which callers must read as
 * reaching nothing. */
export async function loadApiKeyGrants(organizationId: string, keyIds: string[]): Promise<Map<string, ApiKeyGrant>> {
	if (keyIds.length === 0) return new Map();

	const [grantRows, brandRows] = await Promise.all([
		db
			.select({
				apiKeyId: apiKeyGrants.apiKeyId,
				allBrands: apiKeyGrants.allBrands,
				createdByUserId: apiKeyGrants.createdByUserId,
				createdByName: user.name,
				issuerMemberId: member.id,
			})
			.from(apiKeyGrants)
			.leftJoin(user, eq(user.id, apiKeyGrants.createdByUserId))
			.leftJoin(member, and(eq(member.userId, apiKeyGrants.createdByUserId), eq(member.organizationId, organizationId)))
			.where(inArray(apiKeyGrants.apiKeyId, keyIds)),
		// Joined to the organization's brands so a row naming another tenant's
		// brand narrows the key rather than widening it.
		db
			.select({ apiKeyId: apiKeyBrands.apiKeyId, brandId: apiKeyBrands.brandId })
			.from(apiKeyBrands)
			.innerJoin(brands, and(eq(brands.id, apiKeyBrands.brandId), eq(brands.organizationId, organizationId)))
			.where(inArray(apiKeyBrands.apiKeyId, keyIds)),
	]);

	const brandsByKey = new Map<string, string[]>();
	for (const row of brandRows) {
		brandsByKey.set(row.apiKeyId, [...(brandsByKey.get(row.apiKeyId) ?? []), row.brandId]);
	}

	return new Map(
		grantRows.map((row) => [
			row.apiKeyId,
			{
				brandIds: row.allBrands ? null : (brandsByKey.get(row.apiKeyId) ?? []),
				createdBy: row.createdByUserId ? { id: row.createdByUserId, name: row.createdByName ?? "Unknown" } : null,
				issuerIsMember: row.createdByUserId === null || row.issuerMemberId !== null,
			},
		]),
	);
}

export async function recordApiKeyGrant(input: {
	apiKeyId: string;
	brandIds: string[] | null;
	createdByUserId: string;
}): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.insert(apiKeyGrants).values({
			apiKeyId: input.apiKeyId,
			allBrands: input.brandIds === null,
			createdByUserId: input.createdByUserId,
		});
		if (input.brandIds && input.brandIds.length > 0) {
			await tx.insert(apiKeyBrands).values(input.brandIds.map((brandId) => ({ apiKeyId: input.apiKeyId, brandId })));
		}
	});
}
