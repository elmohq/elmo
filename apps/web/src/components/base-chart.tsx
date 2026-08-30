import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import type { Competitor } from "@workspace/lib/db/schema";
import { Badge } from "@workspace/ui/components/badge";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@workspace/ui/components/chart";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
	type ChartDataPoint,
	type ChartSubject,
	extendLinesToChartEdges,
	filterAndCompleteChartData,
	getBadgeClassName,
	getBadgeVariant,
	isExtendedDataPoint,
	type LookbackPeriod,
	selectCompetitorsToDisplay,
} from "@/lib/chart-utils";

/** The brand's own line is the one people are looking for, so it carries more
 *  weight than the competitors it's plotted against. */
const BRAND_STROKE_WIDTH = 3;
const COMPETITOR_STROKE_WIDTH = 2;
/** How far the other series recede while one is singled out. */
const DIMMED_OPACITY = 0.25;
/** Ring thickness on the hollow competitor dots. */
const DOT_RING_WIDTH = 1.5;

/** Legend that doubles as a way to pick a series out of the chart, since colour
 *  alone can't separate four lines for a colourblind reader.
 *
 *  Three ways in, because hover alone doesn't reach everyone: point at an entry
 *  for a transient look, tab to it for the same from the keyboard, or click to
 *  pin it — which is the only one that works on a touchscreen, and the only one
 *  that survives moving the mouse away.
 *
 *  Clearing on pointer-leave is handled by the container rather than each
 *  button. Per-button leave would fire while crossing the gap between two
 *  entries, flashing everything back to full opacity mid-move. */
function SeriesLegend({
	payload,
	active,
	pinned,
	onHover,
	onPin,
}: {
	payload: Array<{ value: string; dataKey: string; color?: string }>;
	active: string | null;
	pinned: string | null;
	onHover: (key: string | null) => void;
	onPin: (key: string | null) => void;
}) {
	return (
		<div
			role="toolbar"
			aria-label="Chart series"
			className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2"
			onMouseLeave={() => onHover(null)}
		>
			{payload.map((item) => {
				const isActive = active === item.dataKey;
				return (
					<button
						key={item.dataKey}
						type="button"
						aria-pressed={pinned === item.dataKey}
						className="flex items-center gap-1.5 rounded-sm text-muted-foreground text-xs focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
						style={{ opacity: active && !isActive ? 0.4 : 1 }}
						onMouseEnter={() => onHover(item.dataKey)}
						onFocus={() => onHover(item.dataKey)}
						onBlur={() => onHover(null)}
						onClick={() => onPin(pinned === item.dataKey ? null : item.dataKey)}
					>
						<div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
						{item.value}
					</button>
				);
			})}
		</div>
	);
}

interface BaseChartProps {
	data: ChartDataPoint[];
	lookback: LookbackPeriod;
	title?: string;
	visibility?: number | null;
	showTitle?: boolean;
	showBadge?: boolean;
	brand: ChartSubject;
	competitors: Competitor[];
	isAnimationActive?: boolean;
	chartType?: "bar" | "line";
	chartColors?: string[];
	chartHeight?: string;
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
	chartType = "line",
	chartColors: chartColorsProp,
	chartHeight = "250px",
}: BaseChartProps) {
	const completeData = filterAndCompleteChartData(data, lookback);
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const [hoveredSeries, setHoveredSeries] = React.useState<string | null>(null);
	const [pinnedSeries, setPinnedSeries] = React.useState<string | null>(null);
	// A pin outranks a hover, so moving the mouse away doesn't undo a deliberate pick.
	const activeSeries = pinnedSeries ?? hoveredSeries;

	// Assign colors from a stable order so filtering or ranking cannot recolor a competitor.
	const sortedAllCompetitors = [...competitors].sort((a, b) => a.name.localeCompare(b.name));

	const selectedCompetitors = selectCompetitorsToDisplay(competitors, completeData, 3);

	const sortedSelectedCompetitors = [...selectedCompetitors].sort((a, b) => a.name.localeCompare(b.name));

	const chartColors = chartColorsProp ?? context.clientConfig?.branding.chartColors ?? [];
	const chartConfig: ChartConfig = {
		visitors: {
			label: "Visibility",
		},
		[brand.id]: {
			label: brand.name,
			color: chartColors[0],
		},
	};

	sortedAllCompetitors.forEach((competitor, index) => {
		const colorIndex = (index + 1) % chartColors.length;
		chartConfig[competitor.id] = {
			label: competitor.name,
			color: chartColors[colorIndex],
		};
	});

	// Render the brand last so it remains visible when dots overlap.
	const dataKeys = [...sortedSelectedCompetitors.map((c) => c.id), brand.id];

	const strokeWidthFor = (key: string) => (key === brand.id ? BRAND_STROKE_WIDTH : COMPETITOR_STROKE_WIDTH);
	/** Solid dot for the brand, hollow for competitors — a second, quiet cue for
	 *  which line is yours. Radii are picked so both read the same diameter; only
	 *  the centre differs. */
	const dotProps = (key: string, size: number) =>
		key === brand.id
			? { r: size, fill: `var(--color-${key})`, opacity: opacityFor(key) }
			: {
					r: size - DOT_RING_WIDTH / 2,
					fill: "var(--card)",
					stroke: `var(--color-${key})`,
					strokeWidth: DOT_RING_WIDTH,
					opacity: opacityFor(key),
				};
	const opacityFor = (key: string) => (activeSeries && activeSeries !== key ? DIMMED_OPACITY : 1);

	// Each series has solid and dashed lines, but the legend should list it once.
	const legendPayload = [
		{ value: brand.name, dataKey: brand.id, color: chartConfig[brand.id].color },
		...sortedSelectedCompetitors.map((c) => ({
			value: c.name,
			dataKey: c.id,
			color: chartConfig[c.id].color,
		})),
	];

	// For bar charts, filter out days where ALL entities have null values
	// For line charts, keep all days to maintain proper time-based spacing on x-axis
	// and extend lines to chart edges to fill gaps at start/end of data collection
	const chartData =
		chartType === "bar"
			? completeData.filter((point) => {
					return dataKeys.some((key) => {
						const value = point[key];
						return value !== null && value !== undefined;
					});
				})
			: extendLinesToChartEdges(completeData, dataKeys).map((point) => {
					const newPoint = { ...point };
					for (const key of dataKeys) {
						if (isExtendedDataPoint(point, key)) {
							newPoint[`${key}_solid`] = null;
						} else {
							newPoint[`${key}_solid`] = point[key];
						}
					}
					return newPoint;
				});

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
			<div className="flex flex-col" style={{ height: chartHeight }}>
				{chartType === "bar" ? (
					<ChartContainer config={chartConfig} className="aspect-auto min-h-0 w-full flex-1">
						<BarChart data={chartData}>
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
									// Fix: Parse date string directly to avoid double timezone conversion
									// value is already a properly bucketed date string like "2025-07-21"
									const [year, month, day] = value.split("-").map(Number);
									const date = new Date(year, month - 1, day); // Create local date
									return date.toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
									});
								}}
							/>
							<YAxis
								domain={[0, "auto"]}
								type="number"
								allowDataOverflow={false}
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								tickCount={6}
								tickFormatter={(value) => `${value}%`}
							/>
							<ChartTooltip
								isAnimationActive={false}
								cursor={false}
								content={
									<ChartTooltipContent
										labelFormatter={(value) => {
											const [year, month, day] = String(value).split("-").map(Number);
											const date = new Date(year, month - 1, day);
											return date.toLocaleDateString("en-US", {
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
													<div className="flex flex-1 justify-between gap-4 leading-none items-center">
														<div className="grid gap-1.5">
															<span className="text-muted-foreground">
																{chartConfig[name as string]?.label || name}
															</span>
														</div>
														{value !== null && value !== undefined && (
															<span className="text-foreground font-mono font-xs tabular-nums">{value}%</span>
														)}
													</div>
												</>
											);
										}}
									/>
								}
							/>
							{dataKeys.map((key, index) => (
								<Bar
									key={key}
									dataKey={key}
									fill={`var(--color-${key})`}
									fillOpacity={opacityFor(key)}
									minPointSize={2}
									radius={2}
								/>
							))}
						</BarChart>
					</ChartContainer>
				) : (
					<ChartContainer config={chartConfig} className="aspect-auto min-h-0 w-full flex-1">
						<LineChart data={chartData}>
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
									// Fix: Parse date string directly to avoid double timezone conversion
									// value is already a properly bucketed date string like "2025-07-21"
									const [year, month, day] = value.split("-").map(Number);
									const date = new Date(year, month - 1, day); // Create local date
									return date.toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
									});
								}}
							/>
							<YAxis
								domain={[0, "auto"]}
								type="number"
								allowDataOverflow={false}
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								tickCount={6}
								tickFormatter={(value) => `${value}%`}
							/>
							<ChartTooltip
								isAnimationActive={false}
								cursor={false}
								content={({ active, payload, label }) => {
									if (!active || !payload?.length) return null;

									// Dashed extensions are visual continuity, not observed values.
									const filteredPayload = payload.filter((item: any) => {
										const key = item.dataKey as string;
										if (key.endsWith("_solid")) return false;
										if (item.payload && isExtendedDataPoint(item.payload, key)) return false;
										if (item.value === null || item.value === undefined) return false;
										return true;
									});

									if (filteredPayload.length === 0) return null;

									const [year, month, day] = (label as string).split("-").map(Number);
									const date = new Date(year, month - 1, day);
									const formattedDate = date.toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
									});

									return (
										<div className="border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
											<div className="font-medium">{formattedDate}</div>
											<div className="grid gap-1.5">
												{filteredPayload.map((item: any) => {
													const indicatorColor = chartConfig[item.dataKey as string]?.color;
													return (
														<div key={item.dataKey} className="flex w-full items-center gap-2">
															<div
																className="shrink-0 rounded-[2px] h-2.5 w-2.5"
																style={{ backgroundColor: indicatorColor }}
															/>
															<div className="flex flex-1 justify-between gap-4 leading-none items-center">
																<span className="text-muted-foreground">
																	{chartConfig[item.dataKey as string]?.label || item.dataKey}
																</span>
																<span className="text-foreground font-mono font-xs tabular-nums">{item.value}%</span>
															</div>
														</div>
													);
												})}
											</div>
										</div>
									);
								}}
							/>
							{/* Dashed extensions provide continuity; solid overlays mark observed data. */}
							{dataKeys.flatMap((key) => [
								<Line
									key={`${key}-dashed`}
									dataKey={key}
									name={`${key}-dashed`}
									type="bump"
									stroke={`var(--color-${key})`}
									strokeWidth={strokeWidthFor(key)}
									strokeOpacity={opacityFor(key)}
									strokeDasharray="4 4"
									dot={false}
									activeDot={false}
									connectNulls={true}
									isAnimationActive={isAnimationActive}
									legendType="none"
								/>,
								<Line
									key={`${key}-solid`}
									dataKey={`${key}_solid`}
									name={key}
									type="bump"
									stroke={`var(--color-${key})`}
									strokeWidth={strokeWidthFor(key)}
									strokeOpacity={opacityFor(key)}
									dot={({ cx, cy, payload, value }: any) => {
										// Return empty <g> element instead of null to satisfy Recharts types
										if (!payload || isExtendedDataPoint(payload, key) || value === null || value === undefined) {
											return <g key={`dot-empty-${key}-${cx}`} />;
										}
										return <circle key={`dot-${key}-${cx}`} cx={cx} cy={cy} {...dotProps(key, 3)} />;
									}}
									activeDot={({ cx, cy, payload, value }: any) => {
										// Return empty <g> element instead of null to satisfy Recharts types
										if (!payload || isExtendedDataPoint(payload, key) || value === null || value === undefined) {
											return <g key={`activedot-empty-${key}-${cx}`} />;
										}
										return <circle key={`activedot-${key}-${cx}`} cx={cx} cy={cy} {...dotProps(key, 5)} />;
									}}
									connectNulls={true}
									isAnimationActive={isAnimationActive}
								/>,
							])}
						</LineChart>
					</ChartContainer>
				)}
				<SeriesLegend
					payload={legendPayload}
					active={activeSeries}
					pinned={pinnedSeries}
					onHover={setHoveredSeries}
					onPin={setPinnedSeries}
				/>
			</div>
		</div>
	);
}
