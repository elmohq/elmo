/**
 * One tier of a plan's platforms: what the tier is, how often it samples, and
 * which platforms are in it.
 *
 * Shared because the marketing pricing table and the in-app plan cards show the
 * same three tiers, and each having its own copy meant the one rule here — that
 * names sit beside logos, since three Google surfaces share a mark — had to be
 * remembered twice.
 *
 * Takes resolved rows rather than model ids so this package stays free of the
 * plan catalog. The catalog resolves them (`PlanPlatformMember`), which is why
 * neither caller needs an adapter.
 */
import { ModelIcon } from "./model-icon";

export interface PlatformTierRow {
	iconId: string;
	label: string;
}

export function PlatformTier({
	label,
	runsPerDay,
	models,
}: {
	label: string;
	/** The rate every platform in this tier runs at. */
	runsPerDay: number;
	models: PlatformTierRow[];
}) {
	return (
		<div>
			<p className="flex items-baseline justify-between gap-2 text-[11px] font-medium">
				<span>{label}</span>
				<span className="font-mono font-normal text-muted-foreground tabular-nums">{runsPerDay}×/day</span>
			</p>
			<ul className="mt-1 space-y-0.5">
				{models.map((model) => (
					<li key={model.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<ModelIcon iconId={model.iconId} className="size-3 shrink-0" />
						{/* Logos alone were ambiguous — Google AI Mode, AI Overviews and
						    Gemini all carry the same mark — and a name a reader has to
						    hover for is not on the page. */}
						<span className="min-w-0 flex-1 truncate">{model.label}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
