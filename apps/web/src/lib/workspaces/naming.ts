/**
 * How a workspace is named on screen.
 *
 * Customers name a workspace after their company — "Nike", "Acme" — and a bare
 * company name in a list beside brand names doesn't say which is which. So the
 * word is appended, unless the customer already said it: "Nike" reads as "Nike
 * Workspace", "Acme Workspace" is left alone.
 */
const WORKSPACE_SUFFIX = /\s*workspace\s*$/i;

export function workspaceTitle(name: string): string {
	const trimmed = name.trim();
	return WORKSPACE_SUFFIX.test(trimmed) ? trimmed : `${trimmed} Workspace`;
}
