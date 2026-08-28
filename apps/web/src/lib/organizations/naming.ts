/**
 * Customers name an organization after their company, and a bare company name
 * beside brand names doesn't say which is which — unless they already said the
 * word themselves.
 */
const ORGANIZATION_SUFFIX = /\s*organization\s*$/i;

export function organizationTitle(name: string): string {
	const trimmed = name.trim();
	return ORGANIZATION_SUFFIX.test(trimmed) ? trimmed : `${trimmed} Organization`;
}
