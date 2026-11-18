import { VisibilityBar, VisibilityBarEmpty, VisibilityBarSkeleton } from "@/components/visibility-bar";
import type { LookbackPeriod } from "@/lib/lookback";

interface FilteredVisibility {
	currentVisibilityPct: number;
	totalRuns: number;
	totalPrompts: number;
	totalCitations: number;
	visibilityTimeSeries: { date: string; visibility: number | null }[];
}

/**
 * The skeleton stays mounted inside a grid overlay so the bar reserves its
 * vertical space on load and doesn't shove the charts down when the real bar
 * comes in.
 */
export function VisibilityBarSection({
	visibility,
	lookback,
}: {
	visibility: FilteredVisibility | undefined;
	lookback: LookbackPeriod;
}) {
	const hasData = visibility !== undefined && visibility.totalRuns > 0;
	const isEmpty = visibility !== undefined && visibility.totalRuns === 0;

	return (
		<div className="mt-3 grid [&>*]:col-start-1 [&>*]:row-start-1">
			<div className={visibility ? "opacity-0 pointer-events-none" : undefined}>
				<VisibilityBarSkeleton />
			</div>
			{hasData && <VisibilityBar {...visibility} lookback={lookback} />}
			{isEmpty && <VisibilityBarEmpty />}
		</div>
	);
}
