import { useRouteContext } from "@tanstack/react-router";
import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import type { ClientConfig } from "@workspace/config/types";
import type { Landscape } from "@/lib/landscape";
import { BRAND_ROUTE_ID } from "@/lib/route-subject";

/** For companies past the charted few, so the long tail reads as one quiet group. */
export const OTHERS_COLOR = "#cbd5e1";

/** The deployment's chart colours, which the visibility charts use too. */
export function useChartColors(): readonly string[] {
	const context = useRouteContext({ from: BRAND_ROUTE_ID }) as { clientConfig?: ClientConfig };
	const colors = context.clientConfig?.branding?.chartColors;
	return colors && colors.length > 0 ? colors : DEFAULT_CHART_COLORS;
}

/**
 * One colour per company, the same on every chart and table that shows them together: the brand
 * takes the first colour whatever its rank, the next companies in the given order take the
 * following ones, and once the palette runs out the rest share `OTHERS_COLOR`.
 */
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
 * Tracked companies ranked by overall visibility, which fixes each one's colour whichever measure is
 * shown; then any `others` a page also lists, such as companies the answers name but nobody tracks.
 * Until the landscape loads, `others` alone set the order.
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
