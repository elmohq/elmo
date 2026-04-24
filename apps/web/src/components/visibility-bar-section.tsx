import { useRef } from "react";
import { useFilteredVisibility } from "@/hooks/use-filtered-visibility";
import { VisibilityBar, VisibilityBarSkeleton, VisibilityBarEmpty } from "@/components/visibility-bar";
import { usePageFilters } from "@/components/filter-bar";

/**
 * Self-contained visibility bar. Subscribes directly to the filter URL
 * keys it needs and fetches `useFilteredVisibility` itself, so it's a
 * sibling of the chart section rather than something the parent has to
 * wire through. The parent passes the already-search-filtered prompt
 * IDs since search is applied client-side and we don't want to duplicate
 * that logic here.
 *
 * The skeleton stays mounted inside a grid overlay so the bar reserves
 * its vertical space on load and doesn't shove the charts down when the
 * real bar comes in.
 */
export function VisibilityBarSection({
	brandId,
	promptIds,
}: {
	brandId: string | undefined;
	promptIds: string[];
}) {
	const { selectedLookback, selectedModel } = usePageFilters();
	const modelParam = selectedModel === "all" ? undefined : selectedModel;

	const {
		filteredVisibility,
		isLoading: isLoadingVisibility,
		isValidating: isValidatingVisibility,
	} = useFilteredVisibility(brandId, {
		lookback: selectedLookback,
		promptIds: promptIds.length > 0 ? promptIds : undefined,
		model: modelParam,
	});

	// Keep the last-known visibility around so we don't flash the skeleton
	// on a refetch (react-query's isValidating flips true while the new data
	// is in flight even though we already have a prior result to show).
	const lastRef = useRef(filteredVisibility);
	if (filteredVisibility) lastRef.current = filteredVisibility;
	const stable = filteredVisibility || lastRef.current;

	const hasLoaded = stable && !isLoadingVisibility;
	const hasData = hasLoaded && stable.totalRuns > 0;
	const isEmpty = hasLoaded && stable.totalRuns === 0;
	// While refetching on an empty previous result, keep showing the skeleton
	// rather than flashing "no data" between states.
	const showingSkeleton = !stable || (stable.totalRuns === 0 && isValidatingVisibility);

	return (
		<div className="mt-3 grid [&>*]:col-start-1 [&>*]:row-start-1">
			<div className={hasData || (isEmpty && !showingSkeleton) ? "opacity-0 pointer-events-none" : undefined}>
				<VisibilityBarSkeleton />
			</div>
			{hasData && (
				<VisibilityBar
					currentVisibility={stable.currentVisibility}
					totalRuns={stable.totalRuns}
					totalPrompts={stable.totalPrompts}
					totalCitations={stable.totalCitations}
					visibilityTimeSeries={stable.visibilityTimeSeries}
					lookback={stable.lookback}
				/>
			)}
			{isEmpty && !showingSkeleton && <VisibilityBarEmpty />}
		</div>
	);
}
