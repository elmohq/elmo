import type { FanoutSupport } from "@workspace/config/fanout-support";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { InfoTip } from "@/components/fanout-sections";
import type { TrackedTarget } from "@/lib/model-filter";

type Status = FanoutSupport["status"];

const RANK: Record<Status, number> = { supported: 0, discontinued: 1, unknown: 2, never: 3 };

const PILL: Record<Status, { pill: string; status: string }> = {
	supported: {
		pill: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
		status: "text-emerald-700 dark:text-emerald-400",
	},
	discontinued: {
		pill: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
		status: "text-amber-700 dark:text-amber-400",
	},
	unknown: { pill: "bg-muted", status: "text-muted-foreground" },
	never: { pill: "bg-muted", status: "text-muted-foreground" },
};

const formatDay = (day: string, year = true) =>
	new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		...(year ? { year: "numeric" } : {}),
		timeZone: "UTC",
	});

function label(support: FanoutSupport): string {
	switch (support.status) {
		case "supported":
			return "Available";
		case "discontinued":
			return `Stopped ${formatDay(support.since, false)}`;
		case "never":
			return "Not exposed";
		case "unknown":
			return "Unknown";
	}
}

function detail(name: string, support: FanoutSupport): string {
	switch (support.status) {
		case "supported":
			return `${name} reveals the web searches behind its answers.`;
		case "discontinued":
			return `${name} stopped revealing its web searches on ${formatDay(support.since)}. Earlier periods still show theirs.`;
		case "never":
			return `${name} doesn't reveal the web searches behind its answers.`;
		case "unknown":
			return `We haven't confirmed whether ${name} reveals its web searches.`;
	}
}

export function fanoutByModel(targets: TrackedTarget[]): { model: string; support: FanoutSupport }[] {
	const best = new Map<string, FanoutSupport>();
	for (const { model, fanout } of targets) {
		if (!fanout) continue;
		const current = best.get(model);
		if (!current || RANK[fanout.status] < RANK[current.status]) best.set(model, fanout);
	}
	return [...best].map(([model, support]) => ({ model, support }));
}

export function FanoutEngineStatusCard({ targets, model }: { targets: TrackedTarget[]; model?: string }) {
	const engines = fanoutByModel(targets).filter((e) => !model || e.model === model);
	if (engines.length === 0) return null;
	return (
		<Card className="gap-3 py-4">
			<CardHeader className="max-sm:px-4">
				<CardTitle className="flex items-center gap-1 text-base">
					Query Availability
					<InfoTip>Not every engine reveals the web searches it runs. Hover an engine for details.</InfoTip>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-2 text-sm max-sm:px-4">
				{engines.map(({ model, support }) => {
					const meta = getModelMeta(model);
					const style = PILL[support.status];
					return (
						<Tooltip key={model}>
							<TooltipTrigger
								render={
									<span
										className={cn("inline-flex cursor-help items-center gap-1.5 rounded-full px-3 py-1", style.pill)}
									/>
								}
							>
								<ModelIcon iconId={meta.iconId} className="size-3.5" />
								<span className="font-medium">{meta.label}</span>
								<span className={style.status}>{label(support)}</span>
							</TooltipTrigger>
							<TooltipContent className="max-w-xs text-sm font-normal">{detail(meta.label, support)}</TooltipContent>
						</Tooltip>
					);
				})}
			</CardContent>
		</Card>
	);
}
