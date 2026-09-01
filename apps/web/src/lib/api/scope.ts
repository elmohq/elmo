/**
 * The one answer to what a caller reaches. A brand out of reach reads exactly as
 * one that does not exist, so nobody can probe for another tenant's ids.
 */
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import { type Principal, principalReach } from "@/lib/auth/api-auth";
import { ApiError } from "./handler";

type Brand = typeof brands.$inferSelect;

async function scopedBrandIds(auth: Principal): Promise<string[] | null> {
	const { organizationIds, brandIds } = principalReach(auth);
	if (organizationIds === null) return null;
	if (brandIds) return brandIds;
	if (organizationIds.length === 0) return [];
	const rows = await db.select({ id: brands.id }).from(brands).where(inArray(brands.organizationId, organizationIds));
	return rows.map((row) => row.id);
}

/** Undefined for an admin key, which is drizzle's "no condition". */
export async function brandScopeCondition(
	auth: Principal,
	column: Parameters<typeof inArray>[0],
): Promise<SQL | undefined> {
	const ids = await scopedBrandIds(auth);
	if (ids === null) return undefined;
	if (ids.length === 0) return sql`false`;
	return inArray(column, ids);
}

async function loadBrandInScope(auth: Principal, brandId: string): Promise<Brand | null> {
	const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) return null;
	const { organizationIds, brandIds } = principalReach(auth);
	if (organizationIds && !organizationIds.includes(brand.organizationId)) return null;
	if (brandIds && !brandIds.includes(brand.id)) return null;
	return brand;
}

/** Fails exactly as an unknown id fails. `via: "body"` answers `400` instead of
 * `404`, which is what the shipped POST routes do. */
export async function requireBrandInScope(
	auth: Principal,
	brandId: string,
	via: "path" | "body" = "path",
): Promise<Brand> {
	const brand = await loadBrandInScope(auth, brandId);
	if (brand) return brand;
	throw via === "body"
		? new ApiError(400, "Validation Error", `Brand with ID '${brandId}' not found`, "validation_error")
		: new ApiError(404, "Not Found", `Brand "${brandId}" not found.`);
}

export async function isBrandInScope(auth: Principal, brandId: string): Promise<boolean> {
	return (await loadBrandInScope(auth, brandId)) !== null;
}

/** Never looks the workspace up: the check is against ids the caller already
 * reaches, so nobody learns another tenant exists by asking. */
export function requireOrganizationInScope(auth: Principal, organizationId: string): void {
	const { organizationIds } = principalReach(auth);
	if (organizationIds === null) return;
	if (!organizationIds.includes(organizationId)) {
		throw new ApiError(404, "Not Found", `Organization "${organizationId}" not found.`);
	}
}

export function organizationScopeCondition(auth: Principal, column: Parameters<typeof eq>[0]): SQL | undefined {
	const { organizationIds } = principalReach(auth);
	if (organizationIds === null) return undefined;
	if (organizationIds.length === 0) return sql`false`;
	return inArray(column, organizationIds);
}
