"use client";

import * as React from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Badge } from "./ui/badge";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";
import {
	LookbackPeriod,
	ChartDataPoint,
	filterAndCompleteChartData,
	getBadgeVariant,
	getBadgeClassName,
} from "@/lib/chart-utils";
import type { Brand, Competitor } from "@/lib/db/schema";

interface BaseChartProps {
	data: ChartDataPoint[];
	lookback: LookbackPeriod;
	title?: string;
	visibility?: number | null;
	showTitle?: boolean;
	showBadge?: boolean;
	brand: Brand;
	competitors: Competitor[];
	isAnimationActive?: boolean;
}

export function BaseChart({
	data,
	lookback,
	title,
	visibility,
	showTitle = false,
	showBadge = false,
	brand,
	competitors,
	isAnimationActive = false,
}: BaseChartProps) {
	const completeData = filterAndCompleteChartData(data, lookback);

	// Sort competitors alphabetically for consistent ordering
	const sortedCompetitors = [...competitors].sort((a, b) => a.name.localeCompare(b.name));

	// Create dynamic chart config based on brand and competitors
	const chartConfig: ChartConfig = {
		visitors: {
			label: "Visibility",
		},
		[brand.id]: {
			label: brand.name,
			color: WHITE_LABEL_CONFIG.chart_colors[0], // Brand gets first color
		},
	};

	// Add competitors to config with subsequent colors
	sortedCompetitors.forEach((competitor, index) => {
		const colorIndex = (index + 1) % WHITE_LABEL_CONFIG.chart_colors.length;
		chartConfig[competitor.id] = {
			label: competitor.name,
			color: WHITE_LABEL_CONFIG.chart_colors[colorIndex],
		};
	});

	// Get all data keys (competitors + brand) for rendering lines
	// Brand comes last so it renders on top when dots overlap
	const dataKeys = [...sortedCompetitors.map((c) => c.id), brand.id];

	return (
		<div className="flex-1 space-y-2">
			{showTitle && (
				<div className="flex items-center justify-center gap-2">
					{title && <h3 className="text-sm font-medium capitalize">{title}</h3>}
					{showBadge && visibility !== null && (
						<Badge variant={getBadgeVariant(visibility!)} className={`text-xs ${getBadgeClassName(visibility!)}`}>
							{visibility}%
						</Badge>
					)}
				</div>
			)}
			<ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
				<LineChart data={completeData}>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="date"
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						minTickGap={32}
						domain={["dataMin", "dataMax"]}
						type="category"
						tickFormatter={(value) => {
							const date = new Date(value);
							return date.toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
							});
						}}
					/>
					<YAxis
						domain={[0, (dataMax: number) => 100]}
						type="number"
						allowDataOverflow={false}
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						tickCount={6}
						tickFormatter={(value) => `${value}%`}
					/>
					<ChartTooltip
						cursor={false}
						content={
							<ChartTooltipContent
								labelFormatter={(value) => {
									return new Date(value).toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
									});
								}}
								indicator="dot"
								formatter={(value, name, item, index) => {
									const indicatorColor = chartConfig[name as string]?.color;
									return (
										<>
											<div
												className="shrink-0 rounded-[2px] h-2.5 w-2.5"
												style={{
													backgroundColor: indicatorColor,
												}}
											/>
											<div className="flex flex-1 justify-between leading-none items-center">
												<div className="grid gap-1.5">
													<span className="text-muted-foreground">{chartConfig[name as string]?.label || name}</span>
												</div>
												{value !== null && value !== undefined && (
													<span className="text-foreground font-mono font-medium tabular-nums">{value}%</span>
												)}
											</div>
										</>
									);
								}}
							/>
						}
					/>
					{dataKeys.map((key, index) => (
						<Line
							key={key}
							dataKey={key}
							type="bump"
							stroke={`var(--color-${key})`}
							strokeWidth={2}
							// need dots, otherwise first day of line chart won't show
							dot={{ fill: `var(--color-${key})`, strokeWidth: 2, r: 2 }}
							activeDot={{ r: 4, strokeWidth: 2 }}
							connectNulls={false}
							isAnimationActive={isAnimationActive}
						/>
					))}
					<ChartLegend content={<ChartLegendContent payload={[]} />} />
				</LineChart>
			</ChartContainer>
		</div>
	);
}
