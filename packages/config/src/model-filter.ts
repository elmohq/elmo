/**
 * A brand can run a model scraped and grounded, and a model id can't tell those
 * apart, so filter values mark the grounded variant. They don't name the vendor,
 * so a URL survives an operator swapping BrightData for Olostep.
 */
import { getModelMeta } from "./models";
import { premiumModelLabel } from "./plans";

export const ALL_MODELS_VALUE = "all";

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
