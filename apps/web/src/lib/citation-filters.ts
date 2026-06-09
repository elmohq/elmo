/**
 * Shared citation prompt-filtering logic.
 *
 * The tag → prompt-id resolution is non-trivial (branded/unbranded system tags
 * plus user tags) and is used by both the citations server fn and the domain-
 * rating server fn. Keeping it here ensures both endpoints scope to exactly the
 * same set of prompts and can't silently diverge.
 */
import { SYSTEM_TAGS } from "@workspace/lib/db/schema";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";

export interface PromptForFilter {
	id: string;
	tags: string[] | null;
	systemTags: string[] | null;
}

/**
 * Resolve which prompt IDs are in scope for a given (comma-separated) tag
 * filter. With no tags, every prompt is in scope. Mirrors the semantics used
 * by the citations page exactly.
 */
export function resolveEnabledPromptIds(allPrompts: PromptForFilter[], tags: string | undefined): string[] {
	const tagFilter = tags?.split(",").filter(Boolean) || [];
	if (tagFilter.length === 0) return allPrompts.map((p) => p.id);

	const filterByBranded = tagFilter.includes(SYSTEM_TAGS.BRANDED);
	const filterByUnbranded = tagFilter.includes(SYSTEM_TAGS.UNBRANDED);
	const nonSystemFilterTags = tagFilter.filter((t) => t !== SYSTEM_TAGS.BRANDED && t !== SYSTEM_TAGS.UNBRANDED);

	const matchingPrompts = allPrompts.filter((p) => {
		const systemTags = p.systemTags || [];
		const userTags = p.tags || [];

		if (filterByBranded || filterByUnbranded) {
			const effectiveStatus = getEffectiveBrandedStatus(systemTags, userTags);
			if (filterByBranded && effectiveStatus.isBranded) return true;
			if (filterByUnbranded && !effectiveStatus.isBranded) return true;
		}

		if (nonSystemFilterTags.length > 0) {
			const allTagsLower = [...systemTags, ...userTags].map((t) => t.toLowerCase());
			if (nonSystemFilterTags.some((ft) => allTagsLower.includes(ft))) return true;
		}

		return false;
	});

	return matchingPrompts.map((p) => p.id);
}

/** Whether a (comma-separated) tag filter string actually selects any tags. */
export function hasTagFilter(tags: string | undefined): boolean {
	return (tags?.split(",").filter(Boolean).length ?? 0) > 0;
}
