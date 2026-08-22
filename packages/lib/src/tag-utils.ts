import { SYSTEM_TAGS } from "./db/schema";

export const SYSTEM_TAG_VALUES = Object.values(SYSTEM_TAGS);

export function isSystemTag(tag: string): boolean {
	return SYSTEM_TAG_VALUES.includes(tag.toLowerCase() as any);
}

export type EffectiveBrandedStatus = {
	isBranded: boolean;
	isOverridden: boolean;
	systemIsBranded: boolean;
};

/**
 * Determine the effective branded status for a prompt, considering user tag overrides.
 *
 * Rules:
 * - If user tags contain "branded" (and not "unbranded"), treat as branded
 * - If user tags contain "unbranded" (and not "branded"), treat as unbranded
 * - If user tags contain both "branded" and "unbranded", use the system tag
 * - If user tags contain neither, use the system tag
 *
 * All comparisons are case-insensitive.
 */
export function getEffectiveBrandedStatus(systemTags: string[], userTags: string[]): EffectiveBrandedStatus {
	const systemTagsLower = systemTags.map((t) => t.toLowerCase());
	const userTagsLower = userTags.map((t) => t.toLowerCase());

	const systemIsBranded = systemTagsLower.includes(SYSTEM_TAGS.BRANDED);

	const hasBrandedUserTag = userTagsLower.includes(SYSTEM_TAGS.BRANDED);
	const hasUnbrandedUserTag = userTagsLower.includes(SYSTEM_TAGS.UNBRANDED);

	if (hasBrandedUserTag && !hasUnbrandedUserTag) {
		return {
			isBranded: true,
			isOverridden: !systemIsBranded,
			systemIsBranded,
		};
	}
	if (hasUnbrandedUserTag && !hasBrandedUserTag) {
		return {
			isBranded: false,
			isOverridden: systemIsBranded,
			systemIsBranded,
		};
	}

	return {
		isBranded: systemIsBranded,
		isOverridden: false,
		systemIsBranded,
	};
}

export function isPromptBranded(promptValue: string, brandName: string, brandWebsite: string): boolean {
	const promptLower = promptValue.toLowerCase();
	const brandNameLower = brandName.toLowerCase();

	try {
		const url = new URL(brandWebsite.startsWith("http") ? brandWebsite : `https://${brandWebsite}`);
		const domain = url.hostname.replace(/^www\./, "").toLowerCase();
		const domainWithoutTld = domain.split(".")[0];

		return (
			promptLower.includes(brandNameLower) || promptLower.includes(domain) || promptLower.includes(domainWithoutTld)
		);
	} catch {
		return promptLower.includes(brandNameLower);
	}
}

export function computeSystemTags(promptValue: string, brandName: string, brandWebsite: string): string[] {
	const isBranded = isPromptBranded(promptValue, brandName, brandWebsite);
	return [isBranded ? SYSTEM_TAGS.BRANDED : SYSTEM_TAGS.UNBRANDED];
}

export function normalizeTag(tag: string): string {
	return tag.toLowerCase().trim();
}

/**
 * Sanitize user tags - normalize and dedupe.
 * Note: "branded" and "unbranded" are allowed as user tags to override system-computed values.
 */
export function sanitizeUserTags(tags: string[]): string[] {
	return tags
		.map(normalizeTag)
		.filter((tag) => tag.length > 0)
		.filter((tag, index, self) => self.indexOf(tag) === index);
}
