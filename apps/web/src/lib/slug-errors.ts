/**
 * What to say about a slug that can't be used.
 *
 * Shared by the two updates that accept one, so a brand and a workspace refuse
 * in the same words. Thrown rather than returned: a slug now saves with the
 * name beside it, and the form already has one place to report why a save
 * didn't land.
 */
export const INVALID_SLUG = "Use lowercase letters, numbers, and hyphens.";
export const TAKEN_SLUG = "That URL slug is already taken.";
