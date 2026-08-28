/**
 * Customers name a workspace after their company, and a bare company name
 * beside brand names doesn't say which is which — unless they already said the
 * word themselves.
 */
const WORKSPACE_SUFFIX = /\s*workspace\s*$/i;

export function workspaceTitle(name: string): string {
	const trimmed = name.trim();
	return WORKSPACE_SUFFIX.test(trimmed) ? trimmed : `${trimmed} Workspace`;
}
