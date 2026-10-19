import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { InfoTip } from "@/components/fanout-sections";
import type { FanoutEngineState, FanoutEngineStatus } from "@/lib/fanout-engine-status";

const formatDay = (iso: string, year = true) =>
	new Date(iso).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		...(year ? { year: "numeric" } : {}),
		timeZone: "UTC",
	});

const PILL: Record<FanoutEngineState, { pill: string; status: string }> = {
	available: {
		pill: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
		status: "text-emerald-700 dark:text-emerald-400",
	},
	stopped: { pill: "bg-amber-500/15 text-amber-900 dark:text-amber-200", status: "text-amber-700 dark:text-amber-400" },
	"none-yet": { pill: "bg-muted", status: "text-muted-foreground" },
	unsupported: { pill: "bg-muted", status: "text-muted-foreground" },
};

function status(engine: FanoutEngineStatus): string {
	switch (engine.state) {
		case "available":
			return "Available";
		case "stopped":
			return `Stopped ${formatDay(engine.lastFanoutAt!, false)}`;
		case "none-yet":
			return "None yet";
		case "unsupported":
			return "Not exposed";
	}
}

function detail(engine: FanoutEngineStatus): string {
	const name = getModelMeta(engine.model).label;
	switch (engine.state) {
		case "available": {
			const share = engine.searchRuns > 0 ? Math.round((engine.fanoutRuns / engine.searchRuns) * 100) : 0;
			return `${name} revealed its queries on ${share}% of search runs since ${formatDay(engine.firstFanoutAt!)}.`;
		}
		case "stopped":
			return engine.basis === "deployment"
				? `${name} hasn't revealed its searches for any brand since ${formatDay(engine.lastFanoutAt!)}, so none are expected here.`
				: `${name} last revealed a query on ${formatDay(engine.lastFanoutAt!)}. None of the ${engine.searchRunsSinceLastFanout.toLocaleString()} search runs since included them; earlier periods still show theirs.`;
		case "none-yet":
			return `${name} hasn't revealed any queries yet across ${engine.searchRuns.toLocaleString()} search runs.`;
		case "unsupported":
			return `${name} doesn't reveal the searches behind its answers.`;
	}
}

/**
 * Which engines can contribute to this page at all. Answers "why is this empty?"
 * before anyone has to ask, and flags an engine that quietly stopped exposing
 * queries, which otherwise reads as the brand's prompts just not fanning out.
 */
export function FanoutEngineStatusCard({ engines, model }: { engines: FanoutEngineStatus[]; model?: string }) {
	const shown = model ? engines.filter((e) => e.model === model) : engines;
	if (shown.length === 0) return null;
	return (
		<Card className="gap-3 py-4">
			<CardHeader className="max-sm:px-4">
				<CardTitle className="flex items-center gap-1 text-base">
					Query Availability
					<InfoTip>
						Not every engine reveals the web searches it runs. Based on all of this brand's runs, not just the selected
						period. Hover an engine for details.
					</InfoTip>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-2 text-sm max-sm:px-4">
				{shown.map((engine) => {
					const meta = getModelMeta(engine.model);
					const style = PILL[engine.state];
					return (
						<Tooltip key={engine.model}>
							<TooltipTrigger
								render={
									<span
										className={cn("inline-flex cursor-help items-center gap-1.5 rounded-full px-3 py-1", style.pill)}
									/>
								}
							>
								<ModelIcon iconId={meta.iconId} className="size-3.5" />
								<span className="font-medium">{meta.label}</span>
								<span className={style.status}>{status(engine)}</span>
							</TooltipTrigger>
							<TooltipContent className="max-w-xs text-sm font-normal">{detail(engine)}</TooltipContent>
						</Tooltip>
					);
				})}
			</CardContent>
		</Card>
	);
}
