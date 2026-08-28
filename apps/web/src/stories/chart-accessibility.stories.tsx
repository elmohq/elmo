/**
 * Stories for reviewing how legible a visibility chart stays when colour stops
 * carrying its weight — the charts lean on the heavier brand line and on legend
 * isolation rather than on hue, and these are how you check that still holds.
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

/** Population frequencies, so the panels carry some sense of what's at stake. */
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const brand = { id: "brand-1", name: "Acme Corp" } as Brand;

const competitors = Array.from({ length: 3 }, (_, i) => ({
	id: `comp-${String(i + 1).padStart(2, "0")}`,
	name: `Competitor ${String(i + 1).padStart(2, "0")}`,
})) as Competitor[];

/** Deterministic series data, one point per day. */
function makeData(days: number): ChartDataPoint[] {
	let seed = 42;
	const random = () => {
		seed = (seed * 16807) % 2147483647;
		return (seed - 1) / 2147483646;
	};
	const ids = [brand.id, ...competitors.map((c) => c.id)];
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

function Frame({ children }: { children: React.ReactNode }) {
	return (
		<MockRouteContextProvider value={{ clientConfig }}>
			<CvdFilterDefs />
			<div className="space-y-4 p-6">{children}</div>
		</MockRouteContextProvider>
	);
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export default { title: "Chart Accessibility" } satisfies Meta;

/**
 * The same chart under each kind of colour vision. The filters are live CSS, so
 * hovering a legend entry through one shows what a colourblind reader actually
 * gets. The brand's line should be the findable one in every panel.
 */
export const ColourVision = () => {
	setup();
	const data = makeData(30);
	return (
		<Frame>
			<div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
				{VISION_TYPES.map((vision) => {
					const filter =
						vision === "normal" ? undefined : vision === "grayscale" ? "grayscale(1)" : `url(#cvd-${vision})`;
					return (
						<div key={vision} className="space-y-2">
							<div className="text-muted-foreground text-xs">{VISION_LABELS[vision]}</div>
							<div className="rounded-lg border bg-card p-3" style={filter ? { filter } : undefined}>
								<BaseChart data={data} lookback="1m" brand={brand} competitors={competitors} chartHeight="180px" />
							</div>
						</div>
					);
				})}
			</div>
		</Frame>
	);
};

/**
 * Asserts the legend's three ways in: pointer, keyboard, and click-to-pin. The
 * pin is what carries a touchscreen, where there's no hover to fall back on.
 */
export const LegendInteraction = () => {
	setup();
	return (
		<Frame>
			<div className="max-w-xl rounded-lg border bg-card p-3">
				<BaseChart data={makeData(30)} lookback="1m" brand={brand} competitors={competitors} chartHeight="220px" />
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

	// Moving between two entries keeps exactly one of them dimmed-out rather than
	// flashing back to "all series equal" while crossing the gap.
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
