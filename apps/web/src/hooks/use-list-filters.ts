import { useMemo } from "react";
import {
	useQueryState,
	useQueryStates,
	parseAsArrayOf,
	parseAsString,
	parseAsStringLiteral,
} from "nuqs";
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

/** Page-specific enum filters: URL key → allowed values. The FIRST value is
 *  both the default and the "not filtering" sentinel for `isFiltered`. */
export type ExtraFilterSpec = Record<string, readonly [string, ...string[]]>;

type ExtraValues<E extends ExtraFilterSpec> = { [K in keyof E]: E[K][number] };

/** URL-persisted state for the standard dashboard filter set (search, tags,
 *  model, lookback) plus optional page-specific enum keys, so filtered views
 *  stay shareable without each page re-wiring nuqs.
 *
 *  This subscribes to every filter URL key — use it in the component that
 *  composes the page's data query. Display widgets (the filter-bar dropdowns)
 *  keep their own per-key subscriptions so a lookback click doesn't
 *  re-render the whole bar. */
export function useListFilters<E extends ExtraFilterSpec = Record<string, never>>(options?: {
	extra?: E;
}) {
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

	// Key the parsers object by the spec's shape so callers can pass an inline
	// literal without churning `useQueryStates`' input identity every render.
	const extraSpec = options?.extra;
	const extraKey = JSON.stringify(extraSpec ?? null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the spec's JSON shape so an inline `extra` literal doesn't churn the parsers' identity every render
	const extraParsers = useMemo(
		() =>
			Object.fromEntries(
				Object.entries(extraSpec ?? {}).map(([key, values]) => [
					key,
					parseAsStringLiteral(values).withDefault(values[0]),
				]),
			),
		[extraKey],
	);
	const [extraValues, setExtra] = useQueryStates(extraParsers);
	const extra = extraValues as ExtraValues<E>;

	const model = urlModel ?? ALL_MODELS_VALUE;
	const tags = urlTags ?? [];
	const search = urlSearch ?? "";

	const extraFiltered = Object.entries(extraSpec ?? {}).some(
		([key, values]) => (extraValues as Record<string, string>)[key] !== values[0],
	);
	const isFiltered =
		Boolean(search) || tags.length > 0 || model !== ALL_MODELS_VALUE || extraFiltered;

	return {
		model,
		lookback: coerceLookback(urlLookback, defaultLookback),
		tags,
		search,
		extra,
		setModel,
		setLookback: (lookback: LookbackPeriod | null) => setLookback(lookback),
		setTags,
		setSearch,
		setExtra,
		/** True when any narrowing filter is active (lookback never narrows to
		 *  zero on its own, so it doesn't count). Gates which empty state a
		 *  page shows: "no data" vs "no matches for your filters". */
		isFiltered,
		clearFilters: () => {
			setSearch(null);
			setTags(null);
			setModel(null);
			if (Object.keys(extraSpec ?? {}).length > 0) setExtra(null);
		},
	};
}

/** The shell only needs the shared subset, so pages with `extra` keys still
 *  satisfy it without generics leaking into component props. */
export interface ListFilterState {
	isFiltered: boolean;
	clearFilters: () => void;
}
