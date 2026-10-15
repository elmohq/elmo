/** Server functions for the brand overview. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { brandOf, type Landscape, type LandscapeMetric } from "@/lib/landscape";
import { lookbackSchema } from "@/lib/lookback";
import { getMentionTotals } from "@/lib/rollup-read";
import { getBrandShareSeries, getBrandVisibility, getCompetitiveLandscape } from "@/server/analytics-core";
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
		const [visibility, shareSeries, landscape, lastRunAt] = await Promise.all([
			getBrandVisibility(data.brandId, window, filters),
			getBrandShareSeries(data.brandId, window, filters),
			getCompetitiveLandscape(data.brandId, window, filters),
			resolveFilteredPrompts(data.brandId, { tags: data.tags }).then(async (prompts) =>
				prompts.length === 0
					? null
					: (
							await getMentionTotals({
								...window,
								brandId: data.brandId,
								promptIds: prompts.map((p) => p.id),
								model: data.model,
							})
						).last_run_at,
			),
		]);
		const brand = brandOf(landscape);
		const brandSeries = (metric: "sentiment" | "position") =>
			landscape.dates.map((date, i) => ({ date, value: brand.series[metric][i] }));

		return {
			totalPrompts: visibility.totalPrompts,
			totalRuns: visibility.totalRuns,
			lastUpdatedAt: lastRunAt,
			cards: {
				visibility: card(visibility.series.map((p) => ({ date: p.date, value: p.visibility }))),
				share: card(shareSeries.map((p) => ({ date: p.date, value: p.share }))),
				sentiment: card(brandSeries("sentiment")),
				position: card(brandSeries("position")),
			},
			landscape,
		};
	});
