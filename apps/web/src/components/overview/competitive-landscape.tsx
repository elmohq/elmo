import { IconInfoCircle } from "@tabler/icons-react";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import { CompanyTrendChart } from "@/components/company-trend-chart";
import { SiteIcon } from "@/components/site-icon";
import { useCompanyColors } from "@/lib/company-colors";
import {
	CHARTED_COMPETITORS,
	chartedCompanies,
	LANDSCAPE_METRICS,
	type Landscape,
	type LandscapeMetric,
	lowerIsBetter,
	sortByMetric,
} from "@/lib/landscape";
import { METRIC_META } from "@/lib/overview-metrics";

/** The headline cards define each measure for the brand alone; here it applies to every company. */
const MEASURE_INFO: Record<LandscapeMetric, string> = {
	visibility: "Visibility is the share of AI answers to your prompts that mention each company.",
	share: "Share of voice is each company's share of every mention of you and your tracked competitors.",
	sentiment: "Sentiment is how AI answers that mention each company speak of it, from 0 (negative) to 100 (positive).",
	position:
		"Position is where each company comes among the tracked companies an answer names, on average. 1 means named first, so lower is better.",
};

function LandscapeInfo({ metric }: { metric: LandscapeMetric }) {
	return (
		<Tooltip>
			<TooltipTrigger
				aria-label="About the competitive landscape"
				className="text-muted-foreground opacity-60 hover:opacity-100"
			>
				<IconInfoCircle className="size-3.5" />
			</TooltipTrigger>
			<TooltipContent className="max-w-72 space-y-1.5">
				<p>{MEASURE_INFO[metric]}</p>
				<p>
					<span className="font-semibold">Chart:</span> how {METRIC_META[metric].short.toLowerCase()} has changed over
					time for your brand and the top {CHARTED_COMPETITORS} competitors on it.
				</p>
				<p>
					<span className="font-semibold">Table:</span> every tracked company ranked by its current{" "}
					{METRIC_META[metric].short.toLowerCase()}, overall and per model. The deeper the blue, the better.
				</p>
			</TooltipContent>
		</Tooltip>
	);
}

/** One scale per measure for the grid's shading: the better the value, the deeper the blue. */
function shade(metric: LandscapeMetric, value: number, maxShare: number): number {
	if (metric === "position") return Math.max(0, Math.min(1, (4 - value) / 3));
	if (metric === "share") return maxShare > 0 ? value / maxShare : 0;
	return value;
}

function MetricSwitch({ value, onChange }: { value: LandscapeMetric; onChange: (metric: LandscapeMetric) => void }) {
	return (
		<div
			role="tablist"
			aria-label="Measure"
			className="flex w-full rounded-lg bg-muted p-0.5 text-sm max-[380px]:text-xs sm:inline-flex sm:w-auto"
		>
			{LANDSCAPE_METRICS.map((metric) => (
				<button
					key={metric}
					type="button"
					role="tab"
					aria-selected={metric === value}
					onClick={() => onChange(metric)}
					className={cn(
						"flex-1 whitespace-nowrap rounded-md px-2 py-1 transition-colors max-[380px]:px-1.5 sm:flex-none sm:px-3",
						metric === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
					)}
				>
					{METRIC_META[metric].abbr ? (
						<>
							<span className="sm:hidden" title={METRIC_META[metric].short}>
								{METRIC_META[metric].abbr}
							</span>
							<span className="max-sm:hidden">{METRIC_META[metric].short}</span>
						</>
					) : (
						METRIC_META[metric].short
					)}
				</button>
			))}
		</div>
	);
}

/** Every company on one measure, overall and per model, best first. */
export function ModelGrid({ landscape, metric }: { landscape: Landscape; metric: LandscapeMetric }) {
	const meta = METRIC_META[metric];
	const rows = sortByMetric(landscape.companies, metric);
	const maxShare = Math.max(
		0,
		...landscape.companies.flatMap((c) => Object.values(c.byModel).map((v) => v.share ?? 0)),
	);
	return (
		<table className="w-full text-sm">
			{/* Sticky so the measure's columns stay labelled while a long field of competitors scrolls. */}
			<thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]">
				<tr className="text-xs text-muted-foreground">
					{/* Takes whatever width the panel has to spare, keeping the figures together on the right. */}
					<th className="w-full px-4 py-2.5 text-left font-medium">Company</th>
					<th className="px-2 py-2.5 font-medium">All</th>
					{landscape.models.map((model) => {
						const { label, iconId } = getModelMeta(model);
						return (
							<th key={model} className="px-1 py-2.5 font-medium">
								<Tooltip>
									<TooltipTrigger className="flex w-full justify-center" aria-label={label}>
										<ModelIcon iconId={iconId} className="size-4" />
									</TooltipTrigger>
									<TooltipContent>{label}</TooltipContent>
								</Tooltip>
							</th>
						);
					})}
				</tr>
			</thead>
			<tbody>
				{rows.map((company, i) => (
					<tr
						key={company.name}
						className={cn("border-b last:border-0", company.isBrand && "bg-blue-50/70 dark:bg-blue-950/30")}
					>
						<td className="whitespace-nowrap px-4 py-1.5">
							<span className="inline-flex items-center gap-2">
								<span className="w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
								<SiteIcon domain={company.domain ?? undefined} size="xs" />
								{/* Capped on phones so a long name doesn't push every figure out of view. */}
								<span className={cn("max-w-28 truncate sm:max-w-none", company.isBrand && "font-semibold")}>
									{company.name}
								</span>
							</span>
						</td>
						<td className="px-2 py-1.5 text-center font-semibold tabular-nums">
							{company.totals[metric] === null ? "—" : meta.format(company.totals[metric])}
						</td>
						{landscape.models.map((model) => {
							const value = company.byModel[model]?.[metric] ?? null;
							return (
								<td key={model} className="px-1 py-1">
									<div
										className="w-12 rounded-md py-1 text-center text-xs tabular-nums"
										style={{
											background:
												value === null
													? undefined
													: `rgba(37, 99, 235, ${0.06 + shade(metric, value, maxShare) * 0.34})`,
										}}
									>
										{value === null ? "—" : meta.format(value)}
									</div>
								</td>
							);
						})}
					</tr>
				))}
			</tbody>
		</table>
	);
}

export function CompetitiveLandscape({ landscape, loading }: { landscape?: Landscape; loading: boolean }) {
	const [metric, setMetric] = useState<LandscapeMetric>("visibility");
	const colors = useCompanyColors(landscape);
	const meta = METRIC_META[metric];
	return (
		// On wide screens the page fits the viewport, so the card takes what's left and the grid scrolls within it.
		<Card className="gap-0 xl:min-h-0 xl:flex-1 border-slate-200 bg-slate-50/70 py-0 shadow-none dark:border-slate-800 dark:bg-slate-900/40">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 px-5 pt-4 pb-0">
				<div className="flex items-center gap-2">
					<CardTitle className="text-base">Competitive Landscape</CardTitle>
					<LandscapeInfo metric={metric} />
				</div>
				<MetricSwitch value={metric} onChange={setMetric} />
			</CardHeader>
			<CardContent className="grid gap-4 p-4 xl:min-h-0 xl:flex-1 xl:grid-cols-2 xl:grid-rows-[minmax(0,1fr)]">
				<div className="h-[340px] min-w-0 rounded-lg border bg-card p-4 xl:h-auto">
					{loading || !landscape ? (
						<Skeleton className="h-full w-full" />
					) : (
						<CompanyTrendChart
							dates={landscape.dates}
							companies={chartedCompanies(landscape, metric).map((c) => ({
								name: c.name,
								isBrand: c.isBrand,
								color: colors.get(c.name) ?? "#94a3b8",
								values: c.series[metric],
							}))}
							format={meta.format}
							lowerIsBetter={lowerIsBetter(metric)}
							height="fill"
						/>
					)}
				</div>
				<div className="overflow-auto rounded-lg border bg-card sm:max-h-[480px] xl:max-h-none">
					{loading || !landscape ? (
						<Skeleton className="m-4 h-[260px] w-[420px]" />
					) : (
						<ModelGrid landscape={landscape} metric={metric} />
					)}
				</div>
			</CardContent>
		</Card>
	);
}
