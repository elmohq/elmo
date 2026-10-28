import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { brandOf, LANDSCAPE_METRICS, type Landscape, type LandscapeMetric } from "@/lib/landscape";
import { lookbackSchema } from "@/lib/lookback";
import { getMentionTotals } from "@/lib/rollup-read";
import { getCompetitiveLandscape } from "@/server/analytics-core";
import { resolveBrandWindow } from "@/server/brand-window";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

export interface OverviewCard {
	/** The latest plotted point, so the number matches the right end of the card's line. */
	value: number | null;
	/** From the first plotted point of the period to the last; null with fewer than two. */
	change: number | null;
	series: { date: string; value: number | null }[];
}

export interface DashboardSummaryResponse {
	totalPrompts: number;
	totalRuns: number;
	lastUpdatedAt: string | null;
	/** Shares are fractions of 1; position is an average place, 1 being named first. */
	cards: Record<LandscapeMetric, OverviewCard>;
	landscape: Landscape;
}

function card(series: OverviewCard["series"]): OverviewCard {
	const plotted = series.filter((point) => point.value !== null);
	const first = plotted[0]?.value ?? null;
	const last = plotted.at(-1)?.value ?? null;
	return {
		value: last,
		change: plotted.length > 1 && first !== null && last !== null ? last - first : null,
		series,
	};
}

export const getDashboardSummaryFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			lookback: lookbackSchema.default("1m"),
			model: z.string().optional(),
			tags: z.string().optional(),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<DashboardSummaryResponse> => {
		await requireBrandSession(data.brandId);

		const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(data.brandId, data.lookback, data.timezone);
		const window = { from: fromDateStr, to: toDateStr, timezone };
		const filters = { model: data.model, tags: data.tags };
		const prompts = resolveFilteredPrompts(data.brandId, { tags: data.tags });
		const [landscape, promptCount, totals] = await Promise.all([
			getCompetitiveLandscape(data.brandId, window, filters),
			prompts.then((p) => p.length),
			prompts.then((p) =>
				p.length === 0
					? null
					: getMentionTotals({ ...window, brandId: data.brandId, promptIds: p.map((x) => x.id), model: data.model }),
			),
		]);
		// Every card is the brand's own line in the landscape, so each matches its row and its page.
		const brand = brandOf(landscape);
		const cards = Object.fromEntries(
			LANDSCAPE_METRICS.map((metric) => [
				metric,
				card(landscape.dates.map((date, i) => ({ date, value: brand.series[metric][i] }))),
			]),
		) as DashboardSummaryResponse["cards"];

		return {
			totalPrompts: promptCount,
			totalRuns: totals?.runs ?? 0,
			lastUpdatedAt: totals?.last_run_at ?? null,
			cards,
			landscape,
		};
	});
