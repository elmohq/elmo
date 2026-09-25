import { isPromptType, splitLegacyTypeTags } from "./prompt-type";

export function normalizeTag(tag: string): string {
	return tag.toLowerCase().trim();
}

/**
 * Normalize and dedupe. `branded` and `unbranded` are the prompt type, not
 * tags, so they never land in a prompt's tags; writes that send them resolve
 * through `splitLegacyTypeTags` first.
 */
export function sanitizeUserTags(tags: readonly string[]): string[] {
	return tags
		.map(normalizeTag)
		.filter((tag) => tag.length > 0 && !isPromptType(tag))
		.filter((tag, index, self) => self.indexOf(tag) === index);
}

/**
 * A write's tags, with a lone legacy `branded`/`unbranded` tag read as the
 * override it used to mean. An explicit `branded` wins over the legacy tag;
 * `brandedOverride` is left undefined when the write says nothing either way.
 */
export function readTagsInput(
	tags: readonly string[],
	branded?: boolean | null,
): { tags: string[]; brandedOverride?: boolean | null } {
	const { tags: rest, brandedOverride: legacy } = splitLegacyTypeTags(tags);
	const brandedOverride = branded !== undefined ? branded : legacy;
	const clean = sanitizeUserTags(rest);
	return brandedOverride === undefined ? { tags: clean } : { tags: clean, brandedOverride };
}
