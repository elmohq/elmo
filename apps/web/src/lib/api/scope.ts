/**
 * Turning "who is calling" into "which brands they may see".
 *
 * Every `/api/v1` read and write funnels through one of these, so there is a
 * single answer to what a key can reach and a single place to change it.
 *
 * A brand outside the caller's reach is reported exactly as one that does not
 * exist. That is deliberate: the alternative tells a key which ids belong to
 * other tenants.
 */
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import type { ApiAuth } from "@/lib/auth/api-auth";
import { ApiError } from "./handler";

type Brand = typeof brands.$inferSelect;

/** Every brand the caller may reach, or null when that is "all of them". */
async function scopedBrandIds(auth: ApiAuth): Promise<string[] | null> {
	if (auth.kind === "admin") return null;
	if (auth.brandIds) return auth.brandIds;
	const rows = await db.select({ id: brands.id }).from(brands).where(eq(brands.organizationId, auth.organizationId));
	return rows.map((row) => row.id);
}

/**
 * A `where` fragment restricting a query to the caller's brands, given the
 * column holding a brand id. Returns undefined for an admin key, which is
 * drizzle's "no condition".
 */
export async function brandScopeCondition(
	auth: ApiAuth,
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
async function loadBrandInScope(auth: ApiAuth, brandId: string): Promise<Brand | null> {
	const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) return null;
	if (auth.kind === "admin") return brand;
	if (brand.organizationId !== auth.organizationId) return null;
	if (auth.brandIds && !auth.brandIds.includes(brand.id)) return null;
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
	auth: ApiAuth,
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
export async function isBrandInScope(auth: ApiAuth, brandId: string): Promise<boolean> {
	return (await loadBrandInScope(auth, brandId)) !== null;
}

/**
 * The organization-level counterpart, for the handful of routes scoped to a
 * workspace rather than to a brand.
 *
 * An organization key sees exactly one, so the comparison is against the id it
 * is bound to and the named workspace is never looked up — a key cannot learn
 * that another tenant exists by asking about it.
 */
export function requireOrganizationInScope(auth: ApiAuth, organizationId: string): void {
	if (auth.kind === "organization" && auth.organizationId !== organizationId) {
		throw new ApiError(404, "Not Found", `Organization "${organizationId}" not found.`);
	}
}

/** The listing counterpart: one workspace for an organization key, every one for an admin. */
export function organizationScopeCondition(auth: ApiAuth, column: Parameters<typeof eq>[0]): SQL | undefined {
	if (auth.kind === "admin") return undefined;
	return eq(column, auth.organizationId);
}
