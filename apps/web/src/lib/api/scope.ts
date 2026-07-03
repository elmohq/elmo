/**
 * Tenant-scoping helpers for /api/v1 route handlers.
 *
 * Admin keys (`ApiAuthContext.type === "admin"`) have unrestricted access.
 * User keys are scoped to `auth.brandIds` (the organizations their owner
 * belongs to). Out-of-scope access must be indistinguishable from a
 * nonexistent resource — always a 404 with the same shape a missing row
 * would produce, never a 403 — so existence doesn't leak across tenants.
 */
import type { ApiAuthContext } from "@/lib/auth/api-auth";
import { ApiError } from "./handler";

/** True when the auth context may access the given brand. Admins: always. */
export function canAccessBrand(auth: ApiAuthContext, brandId: string): boolean {
	if (auth.type === "admin") return true;
	return auth.brandIds.includes(brandId);
}

/**
 * Throw the same 404 a nonexistent resource produces when `auth` cannot
 * access `brandId`. Never throws for admin auth.
 */
export function assertBrandAccess(auth: ApiAuthContext, brandId: string, resourceName = "Brand"): void {
	if (!canAccessBrand(auth, brandId)) {
		throw new ApiError(404, "Not Found", `${resourceName} not found`);
	}
}

/**
 * The brand ids `auth` may access, or `null` if unrestricted (admin).
 * For user auth this may be an empty array (member of no organizations).
 */
export function allowedBrandIds(auth: ApiAuthContext): string[] | null {
	if (auth.type === "admin") return null;
	return auth.brandIds;
}
