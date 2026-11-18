import { defineChart, dot, lineY, whenFocused } from "@tanstack/charts";
import { d3Curve } from "@tanstack/charts/d3/shape";
import { decorative } from "@tanstack/charts/mark/decorative";
import { Chart } from "@tanstack/charts/react/tooltip";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { curveBumpX } from "d3-shape";
import type { CSSProperties } from "react";
import { type ChartDataPoint, formatShortDate, isExtendedDataPoint } from "@/lib/chart-utils";

export interface LineSeries {
	id: string;
	label: string;
	color: string;
	primary: boolean;
}

interface Row {
	date: string;
	series: string;
	value: number;
	extended: boolean;
}

const bump = d3Curve(curveBumpX);
const MAX_DATE_LABELS = 16;
const BRAND_STROKE_WIDTH = 3;
const COMPETITOR_STROKE_WIDTH = 2;
const DIMMED_OPACITY = 0.25;
const DOT_RING_WIDTH = 1.5;
// The tooltip body below draws its own surface.
const BARE_TOOLTIP = {
	"--ts-chart-tooltip-background": "transparent",
	"--ts-chart-tooltip-border": "0",
	"--ts-chart-tooltip-shadow": "none",
	"--ts-chart-tooltip-padding": "0",
} as CSSProperties;

function definitionFor(data: ChartDataPoint[], series: LineSeries[], activeSeries: string | null) {
	const dates = data.map((point) => point.date);
	const labelEvery = Math.ceil(dates.length / MAX_DATE_LABELS);
	const highest = Math.max(
		1,
		...data.flatMap((point) => series.map((line) => point[line.id]).filter((value) => typeof value === "number")),
	);
	const layers = series.map((line) => {
		const rows: Row[] = data.flatMap((point) => {
			const value = point[line.id];
			return typeof value === "number"
				? [{ date: point.date, series: line.id, value, extended: isExtendedDataPoint(point, line.id) }]
				: [];
		});
		const observed = rows.filter((row) => !row.extended);
		const opacity = activeSeries && activeSeries !== line.id ? DIMMED_OPACITY : 1;
		const stroke = {
			stroke: line.color,
			strokeWidth: line.primary ? BRAND_STROKE_WIDTH : COMPETITOR_STROKE_WIDTH,
			strokeOpacity: opacity,
			curve: bump,
		};
		const dots = (id: string, size: number) =>
			dot(observed, {
				id,
				x: "date",
				y: "value",
				z: "series",
				...(line.primary
					? { r: size, fill: line.color, fillOpacity: opacity }
					: {
							r: size - DOT_RING_WIDTH / 2,
							fill: "var(--card)",
							stroke: line.color,
							strokeWidth: DOT_RING_WIDTH,
							strokeOpacity: opacity,
						}),
			});
		return {
			// Only the dots answer the pointer, so a day lists each series once and never a carried-over value.
			lines: [
				decorative(lineY(rows, { id: `${line.id}-dashed`, x: "date", y: "value", strokeDasharray: "4 4", ...stroke })),
				decorative(lineY(observed, { id: `${line.id}-solid`, x: "date", y: "value", ...stroke })),
			],
			dots: dots(line.id, 3),
			focused: whenFocused(dots(`${line.id}-focused`, 5), { match: "x" }),
		};
	});
	// Painted in passes, so one series' dots never sit under another's line.
	const marks = [
		...layers.flatMap((layer) => layer.lines),
		...layers.map((layer) => layer.dots),
		...layers.map((layer) => layer.focused),
	];

	return defineChart({
		marks,
		scales: {
			x: {
				scale: () => scalePoint<string>().domain(dates).padding(0.5),
				axis: {
					line: false,
					ticks: {
						size: 0,
						padding: 8,
						format: formatShortDate,
						values: dates.filter((_, index) => index % labelEvery === 0),
					},
					tickLabels: { fontSize: 12, thin: { minGap: 32 } },
				},
			},
			y: {
				// An instance, because the chart infers a factory's domain from the data and drops the zero baseline.
				scale: scaleLinear().domain([0, highest]),
				nice: true,
				grid: true,
				axis: {
					line: false,
					ticks: { size: 0, padding: 8, count: 6, format: (value: number) => `${value}%` },
					tickLabels: { fontSize: 12 },
				},
			},
		},
		focus: "group-x",
		focusRing: false,
		maxFocusDistance: Number.POSITIVE_INFINITY,
		tooltip,
	});
}

export function LineChart({
	data,
	series,
	activeSeries,
}: {
	data: ChartDataPoint[];
	series: LineSeries[];
	activeSeries: string | null;
}) {
	return (
		<Chart
			definition={definitionFor(data, series, activeSeries)}
			ariaLabel="Visibility over time"
			className="min-h-0 w-full flex-1 text-muted-foreground"
			style={BARE_TOOLTIP}
			renderTooltipBody={({ points }) => (
				<div className="border-border/50 bg-background text-foreground grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
					<div className="font-medium">{formatShortDate(String(points[0]?.xValue))}</div>
					<div className="grid gap-1.5">
						{series.map((line) => {
							const point = points.find((candidate) => candidate.datum.series === line.id);
							if (!point) return null;
							return (
								<div key={line.id} className="flex w-full items-center gap-2">
									<div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: line.color }} />
									<div className="flex flex-1 items-center justify-between gap-4 leading-none">
										<span className="text-muted-foreground">{line.label}</span>
										<span className="text-foreground font-mono tabular-nums">{String(point.yValue)}%</span>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}
		/>
	);
}
