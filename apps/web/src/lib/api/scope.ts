/**
 * Turning "who is calling" into "which brands they may see".
 *
 * Every `/api/v1` read and write funnels through one of these, and so does
 * every MCP tool, so there is a single answer to what a caller can reach and a
 * single place to change it. The three kinds of caller differ only in where the
 * set of organizations comes from: an admin key reaches every one, an
 * organization key the one it is bound to, and an OAuth session whichever the
 * person is a member of right now.
 *
 * A brand outside the caller's reach is reported exactly as one that does not
 * exist. That is deliberate: the alternative tells a caller which ids belong to
 * other tenants.
 */
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import { type Principal, principalReach } from "@/lib/auth/api-auth";
import { ApiError } from "./handler";

type Brand = typeof brands.$inferSelect;

/** Every brand the caller may reach, or null when that is "all of them". */
async function scopedBrandIds(auth: Principal): Promise<string[] | null> {
	const { organizationIds, brandIds } = principalReach(auth);
	if (organizationIds === null) return null;
	if (brandIds) return brandIds;
	if (organizationIds.length === 0) return [];
	const rows = await db.select({ id: brands.id }).from(brands).where(inArray(brands.organizationId, organizationIds));
	return rows.map((row) => row.id);
}

/**
 * A `where` fragment restricting a query to the caller's brands, given the
 * column holding a brand id. Returns undefined for an admin key, which is
 * drizzle's "no condition".
 */
export async function brandScopeCondition(
	auth: Principal,
	column: Parameters<typeof inArray>[0],
): Promise<SQL | undefined> {
	const ids = await scopedBrandIds(auth);
	if (ids === null) return undefined;
	// A key that reaches no brand must match no row. `inArray(col, [])` throws
	// in drizzle, so say it directly rather than with an id nothing can equal.
	if (ids.length === 0) return sql`false`;
	return inArray(column, ids);
}

/**
 * The one place the rule lives: a brand is in scope when the caller is an admin
 * key, or when it belongs to the caller's organization and survives whatever
 * narrowing the key carries.
 *
 * Both public helpers below wrap this rather than restating it — a second copy
 * of a tenancy check is a second thing to get wrong.
 */
async function loadBrandInScope(auth: Principal, brandId: string): Promise<Brand | null> {
	const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) return null;
	const { organizationIds, brandIds } = principalReach(auth);
	if (organizationIds && !organizationIds.includes(brand.organizationId)) return null;
	if (brandIds && !brandIds.includes(brand.id)) return null;
	return brand;
}

/**
 * Load a brand the caller may reach, or fail exactly as an unknown id fails.
 * Every brand-scoped route starts here.
 *
 * `via: "body"` is for routes taking the brand in the request body rather than
 * the path: those answer `400` with the brand named, which is what the shipped
 * `POST /prompts` and `POST /competitors` do and what their callers parse.
 * Either way the two failures are worded identically, which is the part that
 * keeps one tenant from probing for another.
 */
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

/** The same rule, for routes that need only the verdict. */
export async function isBrandInScope(auth: Principal, brandId: string): Promise<boolean> {
	return (await loadBrandInScope(auth, brandId)) !== null;
}

/**
 * The organization-level counterpart, for the handful of routes and tools
 * scoped to a workspace rather than to a brand.
 *
 * The named workspace is never looked up — the check is against the ids the
 * caller already reaches, so nobody can learn that another tenant exists by
 * asking about it.
 */
export function requireOrganizationInScope(auth: Principal, organizationId: string): void {
	const { organizationIds } = principalReach(auth);
	if (organizationIds === null) return;
	if (!organizationIds.includes(organizationId)) {
		throw new ApiError(404, "Not Found", `Organization "${organizationId}" not found.`);
	}
}

/** The listing counterpart: the caller's workspaces, or every one for an admin. */
export function organizationScopeCondition(auth: Principal, column: Parameters<typeof eq>[0]): SQL | undefined {
	const { organizationIds } = principalReach(auth);
	if (organizationIds === null) return undefined;
	if (organizationIds.length === 0) return sql`false`;
	return inArray(column, organizationIds);
}
