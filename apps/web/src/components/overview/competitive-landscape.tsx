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
	chartedCompanies,
	LANDSCAPE_METRICS,
	type Landscape,
	type LandscapeMetric,
	lowerIsBetter,
	sortByMetric,
} from "@/lib/landscape";
import { METRIC_META } from "@/lib/overview-metrics";

/** One scale per measure for the grid's shading: the better the value, the deeper the blue. */
function shade(metric: LandscapeMetric, value: number, maxShare: number): number {
	if (metric === "position") return Math.max(0, Math.min(1, (4 - value) / 3));
	if (metric === "share") return maxShare > 0 ? value / maxShare : 0;
	return value;
}

function MetricSwitch({ value, onChange }: { value: LandscapeMetric; onChange: (metric: LandscapeMetric) => void }) {
	return (
		<div role="tablist" aria-label="Measure" className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
			{LANDSCAPE_METRICS.map((metric) => (
				<button
					key={metric}
					type="button"
					role="tab"
					aria-selected={metric === value}
					onClick={() => onChange(metric)}
					className={cn(
						"rounded-md px-3 py-1 transition-colors",
						metric === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
					)}
				>
					{METRIC_META[metric].short}
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
		<table className="text-sm">
			<thead>
				<tr className="border-b text-xs text-muted-foreground">
					<th className="px-4 py-2.5 text-left font-medium">Company</th>
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
								<span className={cn(company.isBrand && "font-semibold")}>{company.name}</span>
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
		<Card className="gap-0 border-slate-200 bg-slate-50/70 py-0 shadow-none dark:border-slate-800 dark:bg-slate-900/40">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 px-5 pt-4 pb-0">
				<CardTitle className="text-base">Competitive Landscape</CardTitle>
				<MetricSwitch value={metric} onChange={setMetric} />
			</CardHeader>
			<CardContent className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto]">
				<div className="min-w-0 rounded-lg border bg-card p-4">
					{loading || !landscape ? (
						<Skeleton className="h-[290px] w-full" />
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
						/>
					)}
				</div>
				<div className="overflow-x-auto rounded-lg border bg-card">
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
