import { IconAlertTriangle } from "@tabler/icons-react";
import { iconIdForModelFilter } from "@workspace/config/model-filter";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { formatDay } from "@/components/ads/shared";
import type { AdSurface } from "@/components/ads/types";

/**
 * A surface that has reported ads before but none in this window is the case
 * worth calling out: it reads identically to "no competitor is buying" and is
 * usually neither. Anything older than this is just history, not a regression.
 */
const QUIET_SURFACE_DAYS = 3;

function isQuiet(surface: AdSurface): boolean {
	if (surface.impressions > 0 || surface.eligibleRuns === 0) return false;
	if (!surface.lastAdAt) return false;
	const age = Date.now() - new Date(surface.lastAdAt).getTime();
	return age > QUIET_SURFACE_DAYS * 24 * 60 * 60 * 1000;
}

function SurfaceRow({ surface }: { surface: AdSurface }) {
	const quiet = isQuiet(surface);
	return (
		<div className="flex min-w-0 items-center gap-2.5">
			<ModelIcon iconId={iconIdForModelFilter(surface.model)} className="size-4 shrink-0" />
			<div className="min-w-0">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-sm font-medium">{surface.label}</span>
					{quiet && (
						<Tooltip>
							<TooltipTrigger render={<IconAlertTriangle className="size-3.5 shrink-0 cursor-help text-amber-600" />} />
							<TooltipContent className="max-w-xs text-xs font-normal">
								No ad has been recorded on {surface.label} since {formatDay(surface.lastAdAt ?? "")}. Either nobody is
								buying against your prompts there, or the surface has stopped exposing ads to us — the two look the same
								from here.
							</TooltipContent>
						</Tooltip>
					)}
				</div>
				<p className="truncate text-xs text-muted-foreground">
					{surface.eligibleRuns === 0
						? "no answers in this period"
						: surface.impressions === 0
							? `no ads in ${surface.eligibleRuns.toLocaleString()} answers`
							: `${surface.adRate}% of ${surface.eligibleRuns.toLocaleString()} answers · ${surface.impressions.toLocaleString()} ads`}
				</p>
			</div>
		</div>
	);
}

/**
 * Per-surface ad rate. Ads are a property of a specific consumer product, and
 * the two we read behave nothing alike, so the blended number on the stat cards
 * needs this beside it to be honest.
 */
export function SurfaceSummary({ surfaces }: { surfaces: AdSurface[] }) {
	if (surfaces.length === 0) return null;

	return (
		<Card>
			<CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3">
				{surfaces.map((surface) => (
					<SurfaceRow key={surface.model} surface={surface} />
				))}
			</CardContent>
		</Card>
	);
}
