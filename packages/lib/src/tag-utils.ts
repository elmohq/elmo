import { SYSTEM_TAGS } from "./db/schema";

/**
 * All possible system tag values
 */
export const SYSTEM_TAG_VALUES = Object.values(SYSTEM_TAGS);

/**
 * Check if a tag is a system tag
 */
export function isSystemTag(tag: string): boolean {
	return SYSTEM_TAG_VALUES.includes(tag.toLowerCase() as any);
}

/**
 * Check if a prompt text is "branded" (contains the brand name or domain)
 */
export function isPromptBranded(promptValue: string, brandName: string, brandWebsite: string): boolean {
	const promptLower = promptValue.toLowerCase();
	const brandNameLower = brandName.toLowerCase();

	try {
		const url = new URL(brandWebsite.startsWith("http") ? brandWebsite : `https://${brandWebsite}`);
		const domain = url.hostname.replace(/^www\./, "").toLowerCase();
		const domainWithoutTld = domain.split(".")[0];

		return promptLower.includes(brandNameLower) || promptLower.includes(domain) || promptLower.includes(domainWithoutTld);
	} catch {
		return promptLower.includes(brandNameLower);
	}
}

/**
 * Compute system tags for a prompt based on its content
 */
export function computeSystemTags(promptValue: string, brandName: string, brandWebsite: string): string[] {
	const isBranded = isPromptBranded(promptValue, brandName, brandWebsite);
	return [isBranded ? SYSTEM_TAGS.BRANDED : SYSTEM_TAGS.UNBRANDED];
}

/**
 * Normalize a tag (lowercase, trimmed)
 */
export function normalizeTag(tag: string): string {
	return tag.toLowerCase().trim();
}

/**
 * Sanitize user tags - normalize, dedupe, and filter out any system tags
 */
export function sanitizeUserTags(tags: string[]): string[] {
	return tags
		.map(normalizeTag)
		.filter((tag) => tag.length > 0 && !isSystemTag(tag))
		.filter((tag, index, self) => self.indexOf(tag) === index); // dedupe
}
