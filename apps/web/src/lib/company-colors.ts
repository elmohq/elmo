import { useRouteContext } from "@tanstack/react-router";
import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import type { ClientConfig } from "@workspace/config/types";
import type { Landscape } from "@/lib/landscape";
import { BRAND_ROUTE_ID } from "@/lib/route-subject";

/** For companies past the charted few, so the long tail reads as one quiet group. */
export const OTHERS_COLOR = "#cbd5e1";

export function useChartColors(): readonly string[] {
	const context = useRouteContext({ from: BRAND_ROUTE_ID }) as { clientConfig?: ClientConfig };
	const colors = context.clientConfig?.branding?.chartColors;
	return colors && colors.length > 0 ? colors : DEFAULT_CHART_COLORS;
}

/** One colour per company across every chart and table on the page; the brand takes the first whatever its rank. */
export function companyColorMap(
	companies: readonly { name: string; isBrand: boolean }[],
	chartColors: readonly string[],
): Map<string, string> {
	const map = new Map<string, string>();
	let next = 1;
	for (const company of companies) {
		if (company.isBrand) map.set(company.name, chartColors[0]);
		else map.set(company.name, next < chartColors.length ? chartColors[next++] : OTHERS_COLOR);
	}
	return map;
}

/**
 * Ranked by overall visibility so a company's colour holds whichever measure is shown; `others` (e.g.
 * named but untracked companies) follow, and alone set the order until the landscape loads.
 */
export function useCompanyColors(
	landscape: Landscape | undefined,
	others: readonly { name: string; isBrand: boolean }[] = [],
): Map<string, string> {
	const chartColors = useChartColors();
	// Ties broken by name, so a company keeps its colour from one load to the next.
	const ranked = [...(landscape?.companies ?? [])].sort(
		(a, b) => (b.totals.visibility ?? -1) - (a.totals.visibility ?? -1) || a.name.localeCompare(b.name),
	);
	const listed = new Set(ranked.map((company) => company.name));
	return companyColorMap([...ranked, ...others.filter((company) => !listed.has(company.name))], chartColors);
}
