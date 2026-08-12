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
 * Side-effect-free so unit tests can import it without pulling in the
 * filter-bar module graph (which touches Better Auth server init via the brand
 * hook).
 */
import { getModelMeta } from "@workspace/config/models";
import { type PlanPlatformGroupId, PLATFORM_TIER_LABELS, premiumModelLabel } from "@workspace/config/plans";

/** Sentinel for "no model filter". */
export const ALL_MODELS_VALUE = "all";

/** Marks the grounded-API variant of a model in a filter value. */
const PREMIUM_SUFFIX = "::premium";

/** One thing a brand's results can be filtered down to. */
export interface TrackedTarget {
	/** What travels in the URL — the model id, or `<model>::premium`. */
	value: string;
	model: string;
	/** The model called directly with its own web search on. */
	premium: boolean;
	/** Which tier it is sold in, so the dropdown can group the way settings/llms does. */
	tier: PlanPlatformGroupId;
	/** Hours between samples of this target. */
	intervalHours: number;
	/** Provider calls per sample. */
	replication: number;
}

/** How often a target runs, as a rate: "4×/day", or "every 3 days" once past one. */
export function describeCadence(intervalHours: number): string {
	if (intervalHours <= 0) return "—";
	if (intervalHours >= 48) return `every ${Math.round(intervalHours / 24)} days`;
	if (intervalHours > 24) return "every other day";
	const perDay = 24 / intervalHours;
	return `${Number.isInteger(perDay) ? perDay : perDay.toFixed(1)}×/day`;
}

/** One line per target: what it is, how often it runs, and how many calls each time. */
export function describeTargetSchedule(target: TrackedTarget): string {
	const runs = describeCadence(target.intervalHours);
	return `${labelForModelFilter(target.value)} — ${runs}${target.replication > 1 ? ` ×${target.replication}` : ""}`;
}

/**
 * The brand's targets under their tier headings, in catalog order, dropping any
 * tier it tracks nothing in. The same three groups the LLM settings page and
 * the pricing table use, because they answer the same question about a model.
 */
export function groupTrackedTargets(targets: readonly TrackedTarget[]): {
	tier: PlanPlatformGroupId;
	label: string;
	values: string[];
}[] {
	const order: PlanPlatformGroupId[] = ["scraped", "api", "premium"];
	return order
		.map((tier) => ({
			tier,
			label: PLATFORM_TIER_LABELS[tier],
			values: targets.filter((target) => target.tier === tier).map((target) => target.value),
		}))
		.filter((group) => group.values.length > 0);
}

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

/**
 * Dropdown options for a brand's targets, with "All" on top once there is more
 * than one. A single-target brand gets no "all" entry, since the filter is
 * redundant (callers hide the dropdown entirely).
 */
export function getAvailableModels(targets: readonly TrackedTarget[]): string[] {
	const values = targets.map((target) => target.value);
	return values.length > 1 ? [ALL_MODELS_VALUE, ...values] : values;
}
