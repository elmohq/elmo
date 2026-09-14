/**
 * A brand's tracked targets: grouping them for the filter dropdown and
 * describing how often each one runs. The filter value vocabulary itself lives
 * in `@workspace/config/model-filter`, which the deployment packages share.
 *
 * Side-effect-free so unit tests can import it without pulling in the
 * filter-bar module graph (which touches Better Auth server init via the brand
 * hook).
 */
import { ALL_MODELS_VALUE, labelForModelFilter } from "@workspace/config/model-filter";
import { PLATFORM_TIER_LABELS, type PlanPlatformGroupId } from "@workspace/config/plans";
import { type I18n, translate, translatePlural } from "@/lib/i18n";

const EN: Pick<I18n, "t" | "tn"> = {
	t: (text, vars) => translate("en", text, vars),
	tn: (count, one, other, vars) => translatePlural("en", count, one, other, vars),
};

export {
	ALL_MODELS_VALUE,
	iconIdForModelFilter,
	labelForModelFilter,
	parseModelFilter,
	targetFilterValue,
} from "@workspace/config/model-filter";

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
export function describeCadence(intervalHours: number, { t, tn } = EN): string {
	if (intervalHours <= 0) return "—";
	if (intervalHours >= 48) return tn(Math.round(intervalHours / 24), "every {count} day", "every {count} days");
	if (intervalHours > 24) return t("every other day");
	const perDay = 24 / intervalHours;
	return t("{rate}×/day", { rate: Number.isInteger(perDay) ? perDay : Number(perDay.toFixed(1)) });
}

/** One line per target: what it is, how often it runs, and how many calls each time. */
export function describeTargetSchedule(target: TrackedTarget, i18n = EN): string {
	const runs = describeCadence(target.intervalHours, i18n);
	return `${i18n.t(labelForModelFilter(target.value))} — ${runs}${target.replication > 1 ? ` ×${target.replication}` : ""}`;
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

/**
 * Dropdown options for a brand's targets, with "All" on top once there is more
 * than one. A single-target brand gets no "all" entry, since the filter is
 * redundant (callers hide the dropdown entirely).
 */
export function getAvailableModels(targets: readonly TrackedTarget[]): string[] {
	const values = targets.map((target) => target.value);
	return values.length > 1 ? [ALL_MODELS_VALUE, ...values] : values;
}
