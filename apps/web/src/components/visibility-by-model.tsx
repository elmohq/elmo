/**
 * The overview's visibility score split by the platform that produced the
 * answers. A brand tracked on several can be well covered overall and still be
 * missing from one of them, which the blended number hides.
 */
import { Link } from "@tanstack/react-router";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { getVisibilityBarColor, getVisibilityTextColor, type TargetVisibility } from "@/lib/chart-utils";
import { iconIdForModelFilter, labelForModelFilter, type TrackedTarget } from "@/lib/model-filter";

export function VisibilityByModel({
	brandId,
	targets,
	byTarget,
	loading,
}: {
	brandId: string;
	targets: TrackedTarget[];
	byTarget: TargetVisibility[];
	loading: boolean;
}) {
	if (loading) {
		return (
			<div className="space-y-3">
				{targets.map((target) => (
					<Skeleton key={target.value} className="h-5 w-full" />
				))}
			</div>
		);
	}

	// What the brand tracks decides the rows and the summary only ranks them, so
	// a platform switched off mid-window doesn't linger on the card, and one
	// switched on yesterday shows up before its first run lands.
	const ranked = byTarget.filter((entry) => targets.some((target) => target.value === entry.target));
	const rankedTargets = new Set(ranked.map((entry) => entry.target));
	const rows: TargetVisibility[] = [
		...ranked,
		...targets
			.filter((target) => !rankedTargets.has(target.value))
			.map((target) => ({ target: target.value, current: null, average: null, runs: 0 })),
	];

	return (
		<div className="space-y-3">
			{rows.map((row) => (
				<div key={row.target} className="flex items-center gap-3">
					<Tooltip>
						<TooltipTrigger asChild>
							<Link
								to="/app/$brand/visibility"
								params={{ brand: brandId }}
								search={{ model: row.target }}
								className="flex w-44 shrink-0 items-center gap-2 hover:underline"
							>
								<ModelIcon iconId={iconIdForModelFilter(row.target)} className="size-3.5 shrink-0" />
								<span className="truncate text-sm">{labelForModelFilter(row.target)}</span>
							</Link>
						</TooltipTrigger>
						<TooltipContent className="max-w-xs text-sm">
							{row.runs > 0
								? `Averaged ${row.average}% over ${row.runs.toLocaleString()} evaluations in the last 30 days.`
								: "No evaluations on this platform in the last 30 days."}
						</TooltipContent>
					</Tooltip>
					<div className="relative h-2 flex-1 overflow-hidden rounded-full bg-primary/10">
						{row.current !== null && (
							<div
								className={`h-full rounded-full transition-all ${getVisibilityBarColor(row.current)}`}
								style={{ width: `${row.current}%` }}
							/>
						)}
					</div>
					<span
						className={`w-10 shrink-0 text-right text-sm font-semibold tabular-nums ${row.current === null ? "text-muted-foreground" : getVisibilityTextColor(row.current)}`}
					>
						{row.current === null ? "—" : `${row.current}%`}
					</span>
				</div>
			))}
		</div>
	);
}
