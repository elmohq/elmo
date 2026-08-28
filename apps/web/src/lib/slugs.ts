/**
 * Setting a URL segment, as one answer shape.
 *
 * A refused slug is an ordinary outcome the field reports next to the input, not
 * an exception — so both setters answer with this rather than throwing, and the
 * one `SlugField` that drives them knows every reason it can get back.
 *
 * A union rather than a struct of optionals: success carries a slug and failure
 * carries a reason, and neither caller should have to write a fallback for the
 * combination that can't happen.
 */
export type SlugError = "invalid" | "taken";

export type SlugResult = { ok: true; slug: string } | { ok: false; error: SlugError };

const SLUG_ERRORS: Record<SlugError, string> = {
	invalid: "Use lowercase letters, numbers, and hyphens.",
	taken: "That URL is already taken.",
};

export function slugErrorMessage(error: SlugError): string {
	return SLUG_ERRORS[error];
}
