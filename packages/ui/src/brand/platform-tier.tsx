/**
 * One tier of a plan's platforms: what the tier is, how often it samples, and
 * which platforms are in it.
 *
 * Shared because the marketing pricing table and the in-app plan cards show the
 * same three tiers, and each having its own copy of this meant the rules below
 * — that a platform only states a rate when it departs from its tier's, and
 * that names sit beside logos — had to be remembered in two places.
 *
 * Takes resolved rows rather than model ids so this package stays free of the
 * plan catalog; the caller already knows how to name a model.
 */
import { ModelIcon } from "./model-icon";

export interface PlatformTierRow {
	iconId: string;
	label: string;
	runsPerDay: number;
}

export function PlatformTier({
	label,
	note,
	runsPerDay,
	models,
}: {
	label: string;
	note: string;
	/** The rate this tier's platforms run at unless a row says otherwise. */
	runsPerDay: number;
	models: PlatformTierRow[];
}) {
	return (
		<div>
			<p className="flex items-baseline justify-between gap-2 text-[11px] font-medium">
				<span>{label}</span>
				<span className="font-mono font-normal text-muted-foreground tabular-nums">{runsPerDay}×/day</span>
			</p>
			<p className="text-[10px] text-muted-foreground">{note}</p>
			<ul className="mt-1 space-y-0.5">
				{models.map((model) => (
					<li key={model.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<ModelIcon iconId={model.iconId} className="size-3 shrink-0" />
						{/* Logos alone were ambiguous — Google AI Mode, AI Overviews and
						    Gemini all carry the same mark — and a name a reader has to
						    hover for is not on the page. */}
						<span className="min-w-0 flex-1 truncate">{model.label}</span>
						{model.runsPerDay !== runsPerDay && <span className="font-mono tabular-nums">{model.runsPerDay}×/day</span>}
					</li>
				))}
			</ul>
		</div>
	);
}
