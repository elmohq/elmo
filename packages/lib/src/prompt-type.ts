/**
 * Whether a prompt names the brand. This is derived from the prompt text and
 * the brand's current name, aliases, and domains every time it is read, never
 * stored, so renaming a brand or adding an alias reclassifies every prompt at
 * once. A misclassified prompt is fixed by adding the alias it uses.
 */
import { mentionsSubject, normalizeDomain } from "./mentions";

export const PROMPT_TYPES = ["branded", "unbranded"] as const;
export type PromptType = (typeof PROMPT_TYPES)[number];

export interface BrandIdentity {
	name: string;
	website: string;
	aliases?: readonly string[] | null;
	additionalDomains?: readonly string[] | null;
}

/**
 * The same rule that counts a brand mention in an answer, plus the website's
 * bare label ("acmecorp" from acmecorp.com), since people type a product name
 * run together far more often than they type its domain.
 */
export function mentionsBrand(promptValue: string, brand: BrandIdentity): boolean {
	const label = normalizeDomain(brand.website).split(".")[0];
	return mentionsSubject(promptValue.toLowerCase(), {
		name: brand.name,
		aliases: [...(brand.aliases ?? []), label],
		domains: [brand.website, ...(brand.additionalDomains ?? [])],
	});
}

export function promptTypeOf(branded: boolean): PromptType {
	return branded ? "branded" : "unbranded";
}

export function isPromptType(value: unknown): value is PromptType {
	return value === "branded" || value === "unbranded";
}

export interface PromptFilter {
	/** A prompt carrying any of these matches. Empty means no tag constraint. */
	tags: string[];
	type?: PromptType;
}

/**
 * Branded and unbranded used to be tags, so links, API calls, and MCP tool
 * calls still send them in `tags`. Those resolve to the type filter here; both
 * at once meant "either", which is no constraint.
 */
export function parsePromptFilter(input: { tags?: string | readonly string[]; type?: string }): PromptFilter {
	const raw = typeof input.tags === "string" ? input.tags.split(",") : (input.tags ?? []);
	const all = raw.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
	const legacyTypes = [...new Set(all.filter(isPromptType))];
	const tags = [...new Set(all.filter((tag) => !isPromptType(tag)))];
	const type = isPromptType(input.type) ? input.type : legacyTypes.length === 1 ? legacyTypes[0] : undefined;
	return type ? { tags, type } : { tags };
}

export function matchesPromptFilter(
	prompt: { tags: readonly string[]; branded: boolean },
	filter: PromptFilter,
): boolean {
	if (filter.type && promptTypeOf(prompt.branded) !== filter.type) return false;
	return filter.tags.length === 0 || filter.tags.some((tag) => prompt.tags.includes(tag));
}
