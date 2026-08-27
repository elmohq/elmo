/**
 * The scopes an organization API key can hold.
 *
 * The wire format is `resource:action`; better-auth stores the same grant in
 * the key's `permissions` column as `{ resource: [action] }`, so the two
 * conversions below are the only places that spelling is bridged.
 *
 * There is deliberately no `billing:write` and no `reports:*`. Billing is
 * read-only by construction rather than by a check somewhere, and report
 * generation spends provider budget with no organization to attribute it to,
 * so it stays admin-only.
 */

export const API_SCOPES = [
	"brands:read",
	"brands:write",
	"prompts:read",
	"prompts:write",
	"prompts:delete",
	"competitors:read",
	"competitors:write",
	"competitors:delete",
	"analytics:read",
	"runs:read",
	"billing:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

const SCOPE_SET = new Set<string>(API_SCOPES);

export function isApiScope(value: string): value is ApiScope {
	return SCOPE_SET.has(value);
}

/** `{ prompts: ["read", "write"] }` → `["prompts:read", "prompts:write"]`. */
export function permissionsToScopes(permissions: unknown): ApiScope[] {
	if (!permissions || typeof permissions !== "object") return [];
	const scopes: ApiScope[] = [];
	for (const [resource, actions] of Object.entries(permissions as Record<string, unknown>)) {
		if (!Array.isArray(actions)) continue;
		for (const action of actions) {
			const scope = `${resource}:${action}`;
			if (isApiScope(scope)) scopes.push(scope);
		}
	}
	return scopes;
}

/** The inverse, for the create path. Unknown scopes are dropped, not trusted. */
export function scopesToPermissions(scopes: readonly string[]): Record<string, string[]> {
	const permissions: Record<string, string[]> = {};
	for (const scope of scopes) {
		if (!isApiScope(scope)) continue;
		const [resource, action] = scope.split(":");
		const actions = permissions[resource] ?? [];
		actions.push(action);
		permissions[resource] = actions;
	}
	return permissions;
}
