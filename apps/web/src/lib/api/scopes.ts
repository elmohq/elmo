/**
 * A key either reads, or it reads and writes. The wire spells a grant as the
 * bare word; better-auth stores it as `{ resource: [action] }` under the one
 * resource below, and the two conversions here are the only bridge.
 *
 * `write` does not imply `read`: a read-write key holds both, so every check
 * downstream stays plain set membership.
 *
 * Nothing finer is offered because nothing finer would be enforcing anything a
 * caller could not already reach: the operations worth withholding — report
 * generation, brand analysis, prompt deletion, every billing write — are
 * admin-only, which is a property of the endpoint rather than a scope somebody
 * could tick.
 */

export const API_SCOPES = ["read", "write"] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** The single resource better-auth files every grant under. */
const RESOURCE = "api";

export function permissionsToScopes(permissions: unknown): ApiScope[] {
	if (!permissions || typeof permissions !== "object") return [];
	const actions = (permissions as Record<string, unknown>)[RESOURCE];
	if (!Array.isArray(actions)) return [];
	return API_SCOPES.filter((scope) => actions.includes(scope));
}

/** Unknown scopes are dropped, not trusted. */
export function scopesToPermissions(scopes: readonly string[]): Record<string, string[]> {
	return { [RESOURCE]: API_SCOPES.filter((scope) => scopes.includes(scope)) };
}
