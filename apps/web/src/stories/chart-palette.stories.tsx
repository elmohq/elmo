/**
 * Stories for reviewing the chart palette itself rather than any one chart.
 *
 * Each view is rendered once as-is, then through Machado-Oliveira-Fernandes
 * colour-vision filters at full severity, then in grayscale — because the whole
 * point of the palette is what it looks like to someone who isn't seeing all of
 * it. The shipped palette, a candidate, and the previous one sit side by side.
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

type VisionType = "normal" | "grayscale" | keyof typeof CVD_MATRICES;

const VISION_TYPES: VisionType[] = ["normal", "deuteranopia", "protanopia", "tritanopia", "grayscale"];

/** Population frequencies, so the rows carry some sense of what's at stake. */
const VISION_LABELS: Record<VisionType, string> = {
	normal: "Normal vision",
	deuteranopia: "Deuteranopia (~6% of men)",
	protanopia: "Protanopia (~2% of men)",
	tritanopia: "Tritanopia (rare)",
	grayscale: "Grayscale — the black & white test",
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

/**
 * Grayscale isn't a kind of colour blindness — it's the shortcut test. If the
 * series are still tellable apart with hue removed entirely, they survive any
 * colour vision, because what's left is lightness.
 */
function Vision({ type, children }: { type: VisionType; children: React.ReactNode }) {
	const filter = type === "normal" ? undefined : type === "grayscale" ? "grayscale(1)" : `url(#cvd-${type})`;
	return <div style={filter ? { filter } : undefined}>{children}</div>;
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

/**
 * Candidate palette, not shipped — Okabe-Ito's hues with the brand blue in slot
 * one. It spans a much wider lightness range than the current palette, which is
 * the "get it right in black and white" rule: once hue collapses under
 * dichromacy, lightness is what's left to tell series apart. The trade is that
 * its lighter hues drop below 3:1 on a white card.
 */
const SPREAD_CANDIDATE = ["#2563eb", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

const PALETTES: Array<{ label: string; colors: string[]; muted?: boolean }> = [
	{ label: "Current (shipped)", colors: ELMO_CHART_COLORS },
	{ label: "Candidate — wider lightness range", colors: SPREAD_CANDIDATE },
	{ label: "Previous", colors: DEFAULT_CHART_COLORS, muted: true },
];

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

const GRID = "grid grid-cols-[10rem_repeat(3,1fr)] gap-4";

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
			<div className={GRID}>
				<div />
				{PALETTES.map((p) => (
					<div key={p.label} className={`text-xs font-medium text-center ${p.muted ? "text-muted-foreground" : ""}`}>
						{p.label}
					</div>
				))}
			</div>
			{VISION_TYPES.map((vision) => (
				<Vision key={vision} type={vision}>
					<div className={`${GRID} items-center`}>
						<div className="text-xs text-muted-foreground">{VISION_LABELS[vision]}</div>
						{PALETTES.map((p) => (
							<div key={p.label} className="rounded-lg border bg-card p-3">
								<BaseChart
									data={data}
									lookback="1m"
									brand={brand}
									competitors={competitors}
									chartColors={p.colors}
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
			{PALETTES.map((p) => (
				<Swatches key={p.label} palette={p.colors} label={`${p.label} — ${p.colors.length} colors`} />
			))}
		</Frame>
	);
};
