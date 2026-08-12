/**
 * Stories for reviewing the chart palette itself rather than any one chart.
 *
 * Each view is rendered four times — once as-is, then through Machado-Oliveira-
 * Fernandes colour-vision filters at full severity — because the whole point of
 * the palette is what it looks like to someone who isn't seeing all of it.
 * The previous palette sits beside the current one so the two are comparable.
 */
import type { Meta } from "@storybook/react";
import { DEFAULT_CHART_COLORS, ELMO_CHART_COLORS } from "@workspace/config/constants";
import type { Brand, Competitor } from "@workspace/lib/db/schema";
import { BaseChart } from "@/components/base-chart";
import type { ChartDataPoint } from "@/lib/chart-utils";
import { type ClientConfig, setMockClientConfig } from "./_mocks/config-client";
import { MockRouteContextProvider, setMockRouteContext } from "./_mocks/tanstack-router";

// ---------------------------------------------------------------------------
// Colour-vision filters
// ---------------------------------------------------------------------------

/** Machado et al. (2009) severity-1.0 matrices, applied in linear RGB. */
const CVD_MATRICES = {
	deuteranopia: "0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0",
	protanopia: "0.152286 1.052583 -0.204868 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0",
	tritanopia: "1.255528 -0.076749 -0.178779 0 0 -0.078411 0.930809 0.147602 0 0 0.004733 0.691367 0.303900 0 0",
} as const;

type VisionType = "normal" | keyof typeof CVD_MATRICES;

const VISION_TYPES: VisionType[] = ["normal", "deuteranopia", "protanopia", "tritanopia"];

/** Population frequencies, so the columns carry some sense of what's at stake. */
const VISION_LABELS: Record<VisionType, string> = {
	normal: "Normal vision",
	deuteranopia: "Deuteranopia (~6% of men)",
	protanopia: "Protanopia (~2% of men)",
	tritanopia: "Tritanopia (rare)",
};

function CvdFilterDefs() {
	return (
		<svg aria-hidden="true" className="absolute h-0 w-0">
			<title>Colour-vision deficiency filter definitions</title>
			<defs>
				{Object.entries(CVD_MATRICES).map(([name, values]) => (
					<filter key={name} id={`cvd-${name}`} colorInterpolationFilters="linearRGB">
						<feColorMatrix type="matrix" values={`${values} 0 0 0 1 0`} />
					</filter>
				))}
			</defs>
		</svg>
	);
}

function Vision({ type, children }: { type: VisionType; children: React.ReactNode }) {
	return <div style={type === "normal" ? undefined : { filter: `url(#cvd-${type})` }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const brand = { id: "brand-1", name: "Acme Corp" } as Brand;

function makeCompetitors(count: number): Competitor[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `comp-${String(i + 1).padStart(2, "0")}`,
		// Zero-padded so alphabetical order — which is what drives colour
		// assignment — matches numeric order and stays predictable here.
		name: `Competitor ${String(i + 1).padStart(2, "0")}`,
	})) as Competitor[];
}

/** Deterministic series data for the given entity ids. */
function makeData(ids: string[], days: number): ChartDataPoint[] {
	let seed = 42;
	const random = () => {
		seed = (seed * 16807) % 2147483647;
		return (seed - 1) / 2147483646;
	};
	const now = new Date("2026-08-11");
	return Array.from({ length: days }, (_, i) => {
		const date = new Date(now);
		date.setDate(date.getDate() - (days - 1 - i));
		const point: ChartDataPoint = { date: date.toISOString().split("T")[0] };
		ids.forEach((id, idx) => {
			point[id] = Math.round(random() * 25 + 70 - idx * 18);
		});
		return point;
	});
}

const clientConfig: ClientConfig = {
	mode: "local",
	features: { readOnly: false, showOptimizeButton: false, canCreateBrands: true },
	branding: { name: "Elmo", chartColors: ELMO_CHART_COLORS },
	analytics: {},
};

function setup() {
	setMockClientConfig(clientConfig);
	setMockRouteContext({ clientConfig });
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function Frame({ children }: { children: React.ReactNode }) {
	return (
		<MockRouteContextProvider value={{ clientConfig }}>
			<CvdFilterDefs />
			<div className="p-6 space-y-10">{children}</div>
		</MockRouteContextProvider>
	);
}

/** One row per vision type, current palette beside the previous one. */
function Comparison({
	label,
	competitors,
	data,
	chartType = "line",
}: {
	label: string;
	competitors: Competitor[];
	data: ChartDataPoint[];
	chartType?: "bar" | "line";
}) {
	return (
		<section className="space-y-3">
			<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
			<div className="grid grid-cols-[10rem_1fr_1fr] gap-4">
				<div />
				<div className="text-xs font-medium text-center">Current</div>
				<div className="text-xs font-medium text-center text-muted-foreground">Previous</div>
			</div>
			{VISION_TYPES.map((vision) => (
				<Vision key={vision} type={vision}>
					<div className="grid grid-cols-[10rem_1fr_1fr] gap-4 items-center">
						<div className="text-xs text-muted-foreground">{VISION_LABELS[vision]}</div>
						{[ELMO_CHART_COLORS, DEFAULT_CHART_COLORS].map((palette, i) => (
							<div key={i === 0 ? "current" : "previous"} className="rounded-lg border bg-card p-3">
								<BaseChart
									data={data}
									lookback="1m"
									brand={brand}
									competitors={competitors}
									chartColors={palette}
									chartType={chartType}
									chartHeight="170px"
								/>
							</div>
						))}
					</div>
				</Vision>
			))}
		</section>
	);
}

function Swatches({ palette, label }: { palette: string[]; label: string }) {
	return (
		<div className="space-y-2">
			<div className="text-xs font-medium">{label}</div>
			{VISION_TYPES.map((vision) => (
				<Vision key={vision} type={vision}>
					<div className="flex items-center gap-3">
						<div className="w-40 shrink-0 text-xs text-muted-foreground">{VISION_LABELS[vision]}</div>
						<div className="flex flex-wrap gap-1">
							{palette.map((color) => (
								<div key={color} className="h-7 w-7 rounded" style={{ backgroundColor: color }} title={color} />
							))}
						</div>
					</div>
				</Vision>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export default { title: "Chart Palette" } satisfies Meta;

/**
 * The common case: a brand with three competitors, so the chart draws the
 * first four palette slots.
 */
export const FourSeries = () => {
	setup();
	const competitors = makeCompetitors(3);
	const data = makeData([brand.id, ...competitors.map((c) => c.id)], 30);
	return (
		<Frame>
			<Comparison label="Brand + 3 competitors — line" competitors={competitors} data={data} />
			<Comparison label="Brand + 3 competitors — bar" competitors={competitors} data={data} chartType="bar" />
		</Frame>
	);
};

/**
 * Colour follows the competitor's position in the brand's full alphabetical
 * list, not its rank in the chart — so a brand tracking twenty competitors
 * draws slots the three-competitor fixtures never reach. Here the three with
 * data sit at alphabetical positions 6, 12 and 18, pulling one colour from
 * each lightness tier.
 */
export const DeepPaletteSlots = () => {
	setup();
	const competitors = makeCompetitors(20);
	const shown = ["comp-06", "comp-12", "comp-18"];
	const data = makeData([brand.id, ...shown], 30);
	return (
		<Frame>
			<Comparison label="Brand + competitors from slots 6, 12, 18 — line" competitors={competitors} data={data} />
			<Comparison
				label="Brand + competitors from slots 6, 12, 18 — bar"
				competitors={competitors}
				data={data}
				chartType="bar"
			/>
		</Frame>
	);
};

/** Every colour in both palettes, under each vision type. */
export const AllColors = () => {
	setup();
	return (
		<Frame>
			<Swatches palette={ELMO_CHART_COLORS} label={`Current — ${ELMO_CHART_COLORS.length} colors`} />
			<Swatches palette={DEFAULT_CHART_COLORS} label={`Previous — ${DEFAULT_CHART_COLORS.length} colors`} />
		</Frame>
	);
};
