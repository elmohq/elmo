import { IconArrowDownRight, IconArrowUpRight, IconInfoCircle } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { Area, AreaChart, Tooltip as ChartTooltip, ResponsiveContainer, YAxis } from "recharts";
import { useBrandParams } from "@/hooks/use-route-params";
import { formatShortDate } from "@/lib/chart-utils";
import { type LandscapeMetric, lowerIsBetter } from "@/lib/landscape";
import { GRADE_STYLES, type Grade, METRIC_META } from "@/lib/overview-metrics";
import type { OverviewCard } from "@/server/dashboard";

/** Drawn in the card's own color: the grade already says good or bad, and a second verdict would clash with it. */
function Change({ metric, change, className }: { metric: LandscapeMetric; change: number | null; className?: string }) {
	const meta = METRIC_META[metric];
	if (change === null || Math.abs(change) < 0.005) return null;
	const improved = lowerIsBetter(metric) ? change < 0 : change > 0;
	const Icon = improved ? IconArrowUpRight : IconArrowDownRight;
	return (
		<span
			className={cn("inline-flex items-center text-sm font-medium", className)}
			title="Change over the selected period"
		>
			<Icon className="size-4" />
			{meta.formatChange(change)}
		</span>
	);
}

function PointTooltip({
	active,
	payload,
	metric,
}: {
	active?: boolean;
	payload?: { payload: { date: string; value: number | null } }[];
	metric: LandscapeMetric;
}) {
	const point = payload?.[0]?.payload;
	if (!active || !point || point.value === null) return null;
	return (
		<div className="whitespace-nowrap rounded-md border bg-background px-2 py-1 text-xs shadow-md">
			<span className="text-muted-foreground">{formatShortDate(point.date)}</span>
			<span className="ml-2 font-medium tabular-nums">{METRIC_META[metric].format(point.value)}</span>
		</div>
	);
}

export function HeadlineCard({
	metric,
	card,
	rank,
	loading,
}: {
	metric: LandscapeMetric;
	card?: OverviewCard;
	rank: number;
	loading: boolean;
}) {
	const meta = METRIC_META[metric];
	const params = useBrandParams();
	const grade: Grade | null = card?.value == null ? null : meta.grade(card.value, rank);
	const style = grade ? GRADE_STYLES[grade] : null;
	return (
		// The whole card leads to the measure's page; the chart's tooltip still works on hover.
		<Link
			to={meta.page}
			params={params}
			aria-label={`${meta.label}: view details`}
			className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
		>
			<Card
				className={cn(
					"relative gap-0 overflow-hidden py-0 shadow-none transition-shadow group-hover:shadow-md",
					style?.card,
				)}
			>
				<CardContent className="px-4 pt-4 sm:px-5">
					<div className="flex items-center justify-between gap-2">
						<span className={cn("text-sm font-semibold", style?.text ?? "text-muted-foreground")}>{meta.label}</span>
						<Tooltip>
							<TooltipTrigger
								aria-label={`About ${meta.label}`}
								className={cn("opacity-60 hover:opacity-100", style?.text ?? "text-muted-foreground")}
							>
								<IconInfoCircle className="size-3.5" />
							</TooltipTrigger>
							<TooltipContent className="max-w-60">{meta.info}</TooltipContent>
						</Tooltip>
					</div>
					<div className="mt-1 flex h-10 items-baseline gap-2">
						{loading ? (
							<Skeleton className="h-9 w-24" />
						) : (
							<>
								<span
									className={cn(
										"text-3xl font-bold tracking-tight tabular-nums sm:text-4xl",
										style?.text ?? "text-muted-foreground",
									)}
								>
									{card?.value == null ? "—" : meta.format(card.value)}
								</span>
								<Change metric={metric} change={card?.change ?? null} className={style?.text} />
							</>
						)}
					</div>
				</CardContent>
				{/* Recharts forces an arrow cursor, which would make this part of the card look unclickable. */}
				<div className="mt-2 h-16 [&_*]:cursor-pointer!">
					{card && style && (
						<ResponsiveContainer width="100%" height="100%">
							<AreaChart
								data={card.series}
								margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
								baseValue={lowerIsBetter(metric) ? "dataMax" : "dataMin"}
							>
								<YAxis hide domain={["dataMin", "dataMax"]} reversed={lowerIsBetter(metric)} />
								<ChartTooltip
									cursor={{ stroke: style.stroke, strokeOpacity: 0.4 }}
									content={<PointTooltip metric={metric} />}
									// Pinned to the top of the chart: the card clips anything that hangs below it.
									position={{ y: 0 }}
									offset={12}
								/>
								<Area
									dataKey="value"
									type="monotone"
									stroke={style.stroke}
									strokeWidth={2}
									fill={style.fill}
									fillOpacity={0.7}
									activeDot={{ r: 3.5, fill: style.stroke, strokeWidth: 0 }}
									connectNulls
									isAnimationActive={false}
								/>
							</AreaChart>
						</ResponsiveContainer>
					)}
				</div>
			</Card>
		</Link>
	);
}
