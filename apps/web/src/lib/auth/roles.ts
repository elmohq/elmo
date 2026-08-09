/**
 * Organization membership role predicates.
 *
 * Deliberately its own module rather than part of policies.ts: the billing
 * settings page needs this in the browser, and policies.ts imports node:crypto
 * for the API-key comparison, which cannot be resolved in a client bundle.
 */

/**
 * Whether a membership role is an org admin. "admin" is written by our
 * provisioning (provisionLocalOrg, provisionUmbrellaOrg); "owner" is what
 * better-auth's own org creation writes — accept either.
 */
export function isOrgAdminRole(role: string): boolean {
	return role === "admin" || role === "owner";
}
