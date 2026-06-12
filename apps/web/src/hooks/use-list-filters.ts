import { useMemo } from "react";
import { useQueryState, parseAsArrayOf, parseAsString } from "nuqs";
import { type LookbackPeriod, getDefaultLookbackPeriod } from "@/lib/chart-utils";
import { useBrand } from "@/hooks/use-brands";
import { ALL_MODELS_VALUE } from "@/lib/model-filter";

// Parsers stay plain — each interactive handler in filter-bar opens its own
// `startTransition` scope so the URL update *and* the `useOptimistic`
// dispatch ride together in one transition. Using nuqs's parser-level
// `startTransition` option gave us an ugly race: `setOptimistic` was
// urgent while the URL setter was transition-priority, so a sync
// effect fired in the urgent render (with URL still stale) and
// snapped the optimistic value back.
export const modelParser = parseAsString;
export const lookbackParser = parseAsString;
export const tagsParser = parseAsArrayOf(parseAsString, ",");
export const searchParser = parseAsString;

const LOOKBACK_VALUES = ["1w", "1m", "3m", "6m", "1y", "all"] as const;
export function coerceLookback(
	raw: string | null | undefined,
	fallback: LookbackPeriod,
): LookbackPeriod {
	return (LOOKBACK_VALUES as readonly string[]).includes(raw ?? "")
		? (raw as LookbackPeriod)
		: fallback;
}

/** URL-persisted state for the standard dashboard filter set (search, tags,
 *  model, lookback), so filtered views stay shareable without each page
 *  re-wiring nuqs. Page-specific keys (e.g. the fan-out `tab`) declare their
 *  own `useQueryState` alongside this hook.
 *
 *  This subscribes to every filter URL key — use it in the component that
 *  composes the page's data query. Display widgets (the filter-bar dropdowns)
 *  keep their own per-key subscriptions so a lookback click doesn't
 *  re-render the whole bar. */
export function useListFilters() {
	const { brand } = useBrand();
	const defaultLookback = useMemo(
		() => getDefaultLookbackPeriod(brand?.earliestDataDate),
		[brand?.earliestDataDate],
	);

	const [urlModel, setModel] = useQueryState("model", modelParser.withDefault(ALL_MODELS_VALUE));
	const [urlLookback, setLookback] = useQueryState(
		"lookback",
		lookbackParser.withDefault(defaultLookback),
	);
	const [urlTags, setTags] = useQueryState("tags", tagsParser.withDefault([]));
	const [urlSearch, setSearch] = useQueryState("q", searchParser.withDefault(""));

	const model = urlModel ?? ALL_MODELS_VALUE;
	const tags = urlTags ?? [];
	const search = urlSearch ?? "";

	return {
		model,
		lookback: coerceLookback(urlLookback, defaultLookback),
		tags,
		search,
		setModel,
		setLookback: (lookback: LookbackPeriod | null) => setLookback(lookback),
		setTags,
		setSearch,
		/** True when any narrowing filter is active (lookback never narrows to
		 *  zero on its own, so it doesn't count). Gates which empty state a
		 *  page shows: "no data" vs "no matches for your filters". */
		isFiltered: Boolean(search) || tags.length > 0 || model !== ALL_MODELS_VALUE,
		clearFilters: () => {
			setSearch(null);
			setTags(null);
			setModel(null);
		},
	};
}

/** The shell only reads this subset of `useListFilters()`'s return. */
export interface ListFilterState {
	isFiltered: boolean;
	clearFilters: () => void;
}
