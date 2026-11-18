import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import type { Competitor } from "@workspace/lib/db/schema";
import * as React from "react";
import {
	type ChartDataPoint,
	type ChartSubject,
	extendLinesToChartEdges,
	filterAndCompleteChartData,
	selectCompetitorsToDisplay,
} from "@/lib/chart-utils";
import type { LookbackPeriod } from "@/lib/lookback";
import { LineChart, type LineSeries } from "./line-chart";

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
	series,
	active,
	pinned,
	onHover,
	onPin,
}: {
	series: LineSeries[];
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
			{series.map((line) => (
				<button
					key={line.id}
					type="button"
					aria-pressed={pinned === line.id}
					className="flex items-center gap-1.5 rounded-sm text-muted-foreground text-xs focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
					style={{ opacity: active && active !== line.id ? 0.4 : 1 }}
					onMouseEnter={() => onHover(line.id)}
					onFocus={() => onHover(line.id)}
					onBlur={() => onHover(null)}
					onClick={() => onPin(pinned === line.id ? null : line.id)}
				>
					<div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: line.color }} />
					{line.label}
				</button>
			))}
		</div>
	);
}

interface BaseChartProps {
	data: ChartDataPoint[];
	lookback: LookbackPeriod;
	brand: ChartSubject;
	competitors: Competitor[];
	chartColors?: string[];
	chartHeight?: string;
}

export function BaseChart({
	data,
	lookback,
	brand,
	competitors,
	chartColors: chartColorsProp,
	chartHeight = "250px",
}: BaseChartProps) {
	const completeData = filterAndCompleteChartData(data, lookback);
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const [hoveredSeries, setHoveredSeries] = React.useState<string | null>(null);
	const [pinnedSeries, setPinnedSeries] = React.useState<string | null>(null);
	// A pin outranks a hover, so moving the mouse away doesn't undo a deliberate pick.
	const activeSeries = pinnedSeries ?? hoveredSeries;

	const chartColors = chartColorsProp ?? context.clientConfig?.branding.chartColors ?? [];
	const color = (index: number) => chartColors[index % chartColors.length] ?? "currentColor";
	const shown = new Set(selectCompetitorsToDisplay(competitors, completeData, 3).map((competitor) => competitor.id));

	const brandSeries: LineSeries = { id: brand.id, label: brand.name, color: color(0), primary: true };
	// Colored by position among every competitor, so filtering or ranking cannot recolor one.
	const competitorSeries: LineSeries[] = [...competitors]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((competitor, index) => ({
			id: competitor.id,
			label: competitor.name,
			color: color(index + 1),
			primary: false,
		}))
		.filter((series) => shown.has(series.id));
	// The brand is drawn last so it stays visible where dots overlap.
	const series = [...competitorSeries, brandSeries];

	return (
		<div className="flex-1">
			<div className="flex flex-col" style={{ height: chartHeight }}>
				<LineChart
					data={extendLinesToChartEdges(
						completeData,
						series.map((line) => line.id),
					)}
					series={series}
					activeSeries={activeSeries}
				/>
				<SeriesLegend
					series={[brandSeries, ...competitorSeries]}
					active={activeSeries}
					pinned={pinnedSeries}
					onHover={setHoveredSeries}
					onPin={setPinnedSeries}
				/>
			</div>
		</div>
	);
}
