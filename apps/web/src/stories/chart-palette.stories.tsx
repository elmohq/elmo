/**
 * Stories for reviewing how legible a chart stays when colour stops carrying
 * its weight. Each view is rendered as-is, then through Machado-Oliveira-
 * Fernandes colour-vision filters at full severity, then in grayscale.
 *
 * The filters are live, so hovering a legend entry through one of them shows
 * what a colourblind reader actually gets — which is the point, since the
 * chart leans on the heavier brand line and legend hover rather than on hue.
 */
import type { Meta } from "@storybook/react";
import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import type { Brand, Competitor } from "@workspace/lib/db/schema";
import { expect, userEvent, within } from "storybook/test";
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

/** Population frequencies, so the columns carry some sense of what's at stake. */
const VISION_LABELS: Record<VisionType, string> = {
	normal: "Normal vision",
	deuteranopia: "Deuteranopia (~6% of men)",
	protanopia: "Protanopia (~2% of men)",
	tritanopia: "Tritanopia (rare)",
	grayscale: "Grayscale",
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
	const filter = type === "normal" ? undefined : type === "grayscale" ? "grayscale(1)" : `url(#cvd-${type})`;
	return (
		<div className="space-y-2">
			<div className="text-muted-foreground text-xs">{VISION_LABELS[type]}</div>
			<div className="rounded-lg border bg-card p-3" style={filter ? { filter } : undefined}>
				{children}
			</div>
		</div>
	);
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
	branding: { name: "Elmo", chartColors: DEFAULT_CHART_COLORS },
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
			<div className="space-y-10 p-6">{children}</div>
		</MockRouteContextProvider>
	);
}

function VisionGrid({
	label,
	hint,
	competitors,
	data,
	chartType = "line",
}: {
	label: string;
	hint?: string;
	competitors: Competitor[];
	data: ChartDataPoint[];
	chartType?: "bar" | "line";
}) {
	return (
		<section className="space-y-3">
			<div>
				<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">{label}</h3>
				{hint && <p className="mt-1 text-muted-foreground text-xs">{hint}</p>}
			</div>
			<div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
				{VISION_TYPES.map((vision) => (
					<Vision key={vision} type={vision}>
						<BaseChart
							data={data}
							lookback="1m"
							brand={brand}
							competitors={competitors}
							chartType={chartType}
							chartHeight="180px"
						/>
					</Vision>
				))}
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export default { title: "Chart Palette" } satisfies Meta;

/**
 * The common case: a brand with three competitors, so the chart draws the first
 * four palette slots. The brand's line is the heavy one in every panel.
 */
export const FourSeries = () => {
	setup();
	const competitors = makeCompetitors(3);
	const data = makeData([brand.id, ...competitors.map((c) => c.id)], 30);
	return (
		<Frame>
			<VisionGrid
				label="Brand + 3 competitors — line"
				hint="Hover a legend entry inside any panel: the other series fade, including under the filters."
				competitors={competitors}
				data={data}
			/>
			<VisionGrid label="Brand + 3 competitors — bar" competitors={competitors} data={data} chartType="bar" />
		</Frame>
	);
};

/**
 * Colour follows the competitor's position in the brand's full alphabetical
 * list, not its rank in the chart — so a brand tracking twenty competitors
 * draws slots the three-competitor fixtures never reach.
 */
export const DeepPaletteSlots = () => {
	setup();
	const competitors = makeCompetitors(20);
	const data = makeData([brand.id, "comp-06", "comp-12", "comp-18"], 30);
	return (
		<Frame>
			<VisionGrid
				label="Brand + competitors from slots 6, 12, 18"
				hint="The competitor colours here are the ones most likely to collide; legend hover is the way out."
				competitors={competitors}
				data={data}
			/>
		</Frame>
	);
};

/**
 * A single unfiltered chart, used to assert the legend's three ways in actually
 * work: pointer, keyboard, and click-to-pin. The pin is what carries a
 * touchscreen, where there's no hover to fall back on.
 */
export const LegendInteraction = () => {
	setup();
	const competitors = makeCompetitors(3);
	const data = makeData([brand.id, ...competitors.map((c) => c.id)], 30);
	return (
		<Frame>
			<div className="max-w-xl rounded-lg border bg-card p-3">
				<BaseChart data={data} lookback="1m" brand={brand} competitors={competitors} chartHeight="220px" />
			</div>
		</Frame>
	);
};

LegendInteraction.play = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	const canvas = within(canvasElement);
	const acme = await canvas.findByRole("button", { name: /Acme Corp/ });
	const alpha = await canvas.findByRole("button", { name: /Competitor 01/ });
	const beta = await canvas.findByRole("button", { name: /Competitor 02/ });

	// Nothing is singled out until asked.
	await expect(acme).toHaveAttribute("aria-pressed", "false");

	// Keyboard: every entry is reachable by tabbing, and focus alone isolates it.
	// The legend lives outside Recharts precisely so these nodes survive a state
	// change; when it didn't, every hover wiped focus and tabbing went nowhere.
	await userEvent.hover(alpha);
	await expect(document.contains(alpha)).toBe(true);

	acme.focus();
	await expect(acme).toHaveFocus();
	await userEvent.tab();
	await expect(alpha).toHaveFocus();
	await userEvent.tab();
	await expect(beta).toHaveFocus();
	await userEvent.tab({ shift: true });
	await expect(alpha).toHaveFocus();

	// Pointer: moving between two entries keeps exactly one of them dimmed-out
	// rather than flashing back to "all series equal" while crossing the gap.
	await userEvent.hover(alpha);
	await expect(beta).toHaveStyle({ opacity: "0.4" });
	await userEvent.hover(beta);
	await expect(alpha).toHaveStyle({ opacity: "0.4" });
	await expect(beta).toHaveStyle({ opacity: "1" });

	// Click pins, and the pin outlives the pointer leaving the legend.
	await userEvent.click(alpha);
	await expect(alpha).toHaveAttribute("aria-pressed", "true");
	await userEvent.unhover(alpha);
	await expect(alpha).toHaveAttribute("aria-pressed", "true");
	await expect(beta).toHaveStyle({ opacity: "0.4" });

	// Clicking the pinned entry again releases it.
	await userEvent.click(alpha);
	await expect(alpha).toHaveAttribute("aria-pressed", "false");
};

/** Every colour in the palette, under each vision type. */
export const AllColors = () => {
	setup();
	return (
		<Frame>
			<div className="space-y-2">
				<div className="font-medium text-xs">{DEFAULT_CHART_COLORS.length} colors</div>
				{VISION_TYPES.map((vision) => (
					<div key={vision} style={vision === "normal" ? undefined : { filter: filterFor(vision) }}>
						<div className="flex items-center gap-3">
							<div className="w-40 shrink-0 text-muted-foreground text-xs">{VISION_LABELS[vision]}</div>
							<div className="flex flex-wrap gap-1">
								{DEFAULT_CHART_COLORS.map((color) => (
									<div key={color} className="h-7 w-7 rounded" style={{ backgroundColor: color }} title={color} />
								))}
							</div>
						</div>
					</div>
				))}
			</div>
		</Frame>
	);
};

function filterFor(type: VisionType) {
	return type === "grayscale" ? "grayscale(1)" : `url(#cvd-${type})`;
}
