/**
 * The model filter's vocabulary: what a brand can be filtered down to, how that
 * travels in a URL, and what to call it.
 *
 * A brand can run the same model two ways — ChatGPT scraped from the consumer
 * product and ChatGPT called directly with its own web search on — and those
 * answer different questions, so they are separate entries. A model id alone
 * cannot tell them apart (both are `chatgpt`, both web-search), which is why a
 * filter keyed on model id listed ChatGPT twice and filtered to neither.
 *
 * The discriminator is grounded-API-or-not rather than the vendor behind it, so
 * a URL survives an operator swapping BrightData for Olostep.
 *
 * Lives in config rather than in the dashboard because the deployment packages
 * name targets too, and every surface that names one has to agree.
 */
import { getModelMeta } from "./models";
import { premiumModelLabel } from "./plans";

/** Sentinel for "no model filter". */
export const ALL_MODELS_VALUE = "all";

/** Marks the grounded-API variant of a model in a filter value. */
const PREMIUM_SUFFIX = "::premium";

export function targetFilterValue(model: string, premium: boolean): string {
	return premium ? `${model}${PREMIUM_SUFFIX}` : model;
}

export function parseModelFilter(value: string): { model: string; premium: boolean } | null {
	if (!value || value === ALL_MODELS_VALUE) return null;
	return value.endsWith(PREMIUM_SUFFIX)
		? { model: value.slice(0, -PREMIUM_SUFFIX.length), premium: true }
		: { model: value, premium: false };
}

/**
 * What to call a filter value. The grounded variant takes the name it is sold
 * under — "GPT-5 Search", not a second "ChatGPT" — which is the same name the
 * LLM settings page and the pricing table use.
 */
export function labelForModelFilter(value: string): string {
	if (value === ALL_MODELS_VALUE) return "All models";
	const parsed = parseModelFilter(value);
	if (!parsed) return value;
	return parsed.premium ? premiumModelLabel(parsed.model) : getModelMeta(parsed.model).label;
}

export function iconIdForModelFilter(value: string): string {
	const parsed = parseModelFilter(value);
	return getModelMeta(parsed?.model ?? value).iconId;
}
