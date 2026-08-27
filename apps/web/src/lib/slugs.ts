/**
 * Setting a URL segment, as one answer shape.
 *
 * A refused slug is an ordinary outcome the field reports next to the input, not
 * an exception — so both setters answer with this rather than throwing, and the
 * one `SlugField` that drives them knows every reason it can get back.
 */
export interface SlugResult {
	ok: boolean;
	error?: "invalid" | "taken";
	slug?: string;
}

export const SLUG_ERRORS: Record<string, string> = {
	invalid: "Use lowercase letters, numbers, and hyphens.",
	taken: "That URL is already taken.",
};

export function slugErrorMessage(error: SlugResult["error"]): string {
	return SLUG_ERRORS[error ?? "invalid"] ?? "That URL can't be used.";
}
