/** Ordering options for the prompts list (#60). "Default" keeps the server's
 *  smart order (visibility priority → weighted mentions → A–Z); the rest
 *  re-sort the already-fetched summaries client-side, each with an ascending
 *  and a descending direction. Ordering never narrows the list, so it stays
 *  out of `useListFilters` / `isFiltered` and lives in the visibility route's
 *  own `validateSearch` (the page-specific search key pattern from PR #336).
 *
 *  `label` is the menu text; `trigger` is the shorter form shown on the bar
 *  button so a long "(high → low)" label doesn't dominate the filter row. */
export const PROMPT_ORDER_OPTIONS = [
	{ value: "default", label: "Default", trigger: "Sort" },
	{ value: "brand-desc", label: "Brand Visibility (high → low)", trigger: "Brand Visibility ↓" },
	{ value: "brand-asc", label: "Brand Visibility (low → high)", trigger: "Brand Visibility ↑" },
	{ value: "competitor-desc", label: "Competitor Visibility (high → low)", trigger: "Competitor Visibility ↓" },
	{ value: "competitor-asc", label: "Competitor Visibility (low → high)", trigger: "Competitor Visibility ↑" },
	{ value: "prompt-asc", label: "Prompt (A → Z)", trigger: "Prompt A–Z" },
	{ value: "prompt-desc", label: "Prompt (Z → A)", trigger: "Prompt Z–A" },
] as const;

export type PromptOrder = (typeof PROMPT_ORDER_OPTIONS)[number]["value"];
export const DEFAULT_PROMPT_ORDER: PromptOrder = "default";

const ORDER_VALUES = PROMPT_ORDER_OPTIONS.map((o) => o.value) as readonly string[];

/** Normalize a raw URL value to a known order, falling back to the default
 *  for stale/garbage links. */
export function coercePromptOrder(raw: unknown): PromptOrder {
	return ORDER_VALUES.includes(raw as string) ? (raw as PromptOrder) : DEFAULT_PROMPT_ORDER;
}

/** The fields the comparators read off a prompt summary. */
export interface OrderablePrompt {
	value: string;
	brandMentionRate: number;
	competitorMentionRate: number;
	averageWeightedMentions: number;
}

/** Re-order a list of prompt summaries. `default` returns the input untouched
 *  so the server's order is preserved; every other key sorts a copy with an
 *  alphabetical tiebreak so equal-metric prompts stay stable and readable. */
export function orderPrompts<T extends OrderablePrompt>(prompts: T[], order: PromptOrder): T[] {
	if (order === "default") return prompts;
	const byValue = (a: T, b: T) => a.value.localeCompare(b.value);
	const sorted = [...prompts];
	switch (order) {
		case "brand-desc":
			sorted.sort(
				(a, b) =>
					b.brandMentionRate - a.brandMentionRate ||
					b.averageWeightedMentions - a.averageWeightedMentions ||
					byValue(a, b),
			);
			break;
		case "brand-asc":
			sorted.sort(
				(a, b) =>
					a.brandMentionRate - b.brandMentionRate ||
					a.averageWeightedMentions - b.averageWeightedMentions ||
					byValue(a, b),
			);
			break;
		case "competitor-desc":
			sorted.sort((a, b) => b.competitorMentionRate - a.competitorMentionRate || byValue(a, b));
			break;
		case "competitor-asc":
			sorted.sort((a, b) => a.competitorMentionRate - b.competitorMentionRate || byValue(a, b));
			break;
		case "prompt-asc":
			sorted.sort(byValue);
			break;
		case "prompt-desc":
			sorted.sort((a, b) => byValue(b, a));
			break;
	}
	return sorted;
}
