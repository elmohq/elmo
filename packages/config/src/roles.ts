/**
 * Organization membership roles.
 *
 * Lives in config rather than beside either consumer because three surfaces ask
 * the same question and must not drift: the billing settings page (browser),
 * the Stripe plugin's subscription authorization, and the dunning email
 * recipient list. Pure and dependency-free, so a client bundle can import it.
 */

/**
 * Roles that may manage an organization — its plan, billing details, and
 * members. "admin" is what our provisioning writes (provisionLocalOrg,
 * provisionUmbrellaOrg); "owner" is what better-auth's own organization
 * creation writes. Both are accepted; a plain "member" is not.
 */
export const ORG_ADMIN_ROLES: readonly string[] = ["admin", "owner"];

export function isOrgAdminRole(role: string | null | undefined): boolean {
	return role != null && ORG_ADMIN_ROLES.includes(role);
}
