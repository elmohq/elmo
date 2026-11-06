import { isPromptType } from "./prompt-type";

export function normalizeTag(tag: string): string {
	return tag.toLowerCase().trim();
}

/**
 * Normalize and dedupe. `branded` and `unbranded` are the prompt type, which
 * is derived rather than set, so they never land in a prompt's tags.
 */
export function sanitizeUserTags(tags: readonly string[]): string[] {
	return tags
		.map(normalizeTag)
		.filter((tag) => tag.length > 0 && !isPromptType(tag))
		.filter((tag, index, self) => self.indexOf(tag) === index);
}
