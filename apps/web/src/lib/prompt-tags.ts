/**
 * Shared prompt-tag filtering, matching the behaviour used by the Citations
 * and Visibility server functions so every page resolves the same tag dropdown
 * (including the Branded / Unbranded system tags) and filters consistently.
 */
import { SYSTEM_TAGS } from "@workspace/lib/db/schema";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";

export interface TaggablePrompt {
	id: string;
	tags: string[] | null;
	systemTags: string[] | null;
}

/** True when a prompt is effectively branded (system tag or user override). */
export function isBrandedPrompt(p: TaggablePrompt): boolean {
	return getEffectiveBrandedStatus(p.systemTags || [], p.tags || []).isBranded;
}

/**
 * Resolve the prompt IDs that match a tag filter. An empty filter matches all.
 * Branded / Unbranded are handled via effective branded status; other tags
 * match against the union of system + user tags (case-insensitive).
 */
export function filterPromptIdsByTags(prompts: TaggablePrompt[], tagFilter: string[]): string[] {
	if (tagFilter.length === 0) return prompts.map((p) => p.id);

	const filterByBranded = tagFilter.includes(SYSTEM_TAGS.BRANDED);
	const filterByUnbranded = tagFilter.includes(SYSTEM_TAGS.UNBRANDED);
	const nonSystemFilterTags = tagFilter.filter((t) => t !== SYSTEM_TAGS.BRANDED && t !== SYSTEM_TAGS.UNBRANDED);

	return prompts
		.filter((p) => {
			const systemTags = p.systemTags || [];
			const userTags = p.tags || [];

			if (filterByBranded || filterByUnbranded) {
				const effectiveStatus = getEffectiveBrandedStatus(systemTags, userTags);
				if (filterByBranded && effectiveStatus.isBranded) return true;
				if (filterByUnbranded && !effectiveStatus.isBranded) return true;
			}

			if (nonSystemFilterTags.length > 0) {
				const allTagsLower = [...systemTags, ...userTags].map((t) => t.toLowerCase());
				if (nonSystemFilterTags.some((ft) => allTagsLower.includes(ft.toLowerCase()))) return true;
			}

			return false;
		})
		.map((p) => p.id);
}
