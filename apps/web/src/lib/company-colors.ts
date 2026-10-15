import { useRouteContext } from "@tanstack/react-router";
import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import type { ClientConfig } from "@workspace/config/types";
import type { Landscape } from "@/lib/landscape";

/** For companies past the charted few, so the long tail reads as one quiet group. */
export const OTHERS_COLOR = "#cbd5e1";

/** The deployment's chart colours, which the visibility charts use too. */
export function useChartColors(): readonly string[] {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const colors = context.clientConfig?.branding.chartColors;
	return colors && colors.length > 0 ? colors : DEFAULT_CHART_COLORS;
}

/**
 * One colour per company, the same on every chart and table that shows them together: the brand
 * takes the first colour whatever its rank, the first `topN` competitors in the given order take the
 * next ones, and the rest share `OTHERS_COLOR`.
 */
export function companyColorMap(
	companies: readonly { name: string; isBrand: boolean }[],
	chartColors: readonly string[],
	topN = 4,
): Map<string, string> {
	const map = new Map<string, string>();
	let next = 1;
	for (const company of companies) {
		if (company.isBrand) map.set(company.name, chartColors[0]);
		else if (next <= topN) map.set(company.name, chartColors[next++ % chartColors.length]);
		else map.set(company.name, OTHERS_COLOR);
	}
	return map;
}

/** Companies ranked by overall visibility, which fixes each one's colour whichever measure is shown. */
export function useCompanyColors(landscape: Landscape | undefined): Map<string, string> {
	const chartColors = useChartColors();
	const ranked = [...(landscape?.companies ?? [])].sort(
		(a, b) => (b.totals.visibility ?? -1) - (a.totals.visibility ?? -1),
	);
	return companyColorMap(ranked, chartColors, Math.min(chartColors.length - 1, ranked.length));
}
