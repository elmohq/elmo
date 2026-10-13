/**
 * Who may issue and revoke which keys. A member can already do everything in a
 * brand that a key for it would allow, so a key for one brand is theirs to
 * issue; reaching across brands, or ending someone else's key, is an admin's.
 */

/** Why the viewer may not issue a key with this reach, or null if they may. */
export function issuanceRefusal(isAdmin: boolean, brandIds: string[] | null): string | null {
	if (isAdmin) return null;
	if (brandIds?.length === 1) return null;
	return "Only organization admins can issue keys for more than one brand";
}

export function mayRevoke(isAdmin: boolean, viewerUserId: string, issuerUserId: string | null): boolean {
	return isAdmin || issuerUserId === viewerUserId;
}
