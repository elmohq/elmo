/** Dependency-free so the billing page, Stripe authorization and dunning emails can share it. */

/** Our provisioning writes "admin"; better-auth's own org creation writes "owner". */
export const ORG_ADMIN_ROLES: readonly string[] = ["admin", "owner"];

export function isOrgAdminRole(role: string | null | undefined): boolean {
	return role != null && ORG_ADMIN_ROLES.includes(role);
}
