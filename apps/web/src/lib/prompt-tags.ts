import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";

export interface TaggablePrompt {
	tags: string[] | null;
	systemTags: string[] | null;
}

export function isBrandedPrompt(p: TaggablePrompt): boolean {
	return getEffectiveBrandedStatus(p.systemTags || [], p.tags || []).isBranded;
}
