import { z } from "zod";
import { resolveBrandWindow } from "@/lib/analytics/brand-window";
import { getBrandQueryFanout } from "@/lib/analytics/core";
import type { AnalyticsReader } from "@/lib/analytics/reader";
import type { FanoutAnalysis } from "@/lib/fanout-analysis";
import { lookbackSchema } from "@/lib/lookback";

export const queryFanoutInput = z.object({
	brandId: z.string(),
	lookback: lookbackSchema.default("1m"),
	model: z.string().optional(),
	tags: z.string().optional(),
	search: z.string().optional(),
	/** Scope to a single prompt (prompt-details Web Queries tab) — lists come back uncapped. */
	promptId: z.string().optional(),
	timezone: z.string().default("UTC"),
});

export interface QueryFanoutResponse extends FanoutAnalysis {
	brandName: string;
	model: string | null;
	/** Whole-number percentage 0-100, unlike the ratio `FanoutAnalysis` carries. */
	coverageRate: number;
}

export async function computeQueryFanout(
	reader: AnalyticsReader,
	input: z.input<typeof queryFanoutInput>,
): Promise<QueryFanoutResponse> {
	const data = queryFanoutInput.parse(input);
	const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(
		reader,
		data.brandId,
		data.lookback,
		data.timezone,
	);
	const analysis = await getBrandQueryFanout(
		reader,
		data.brandId,
		{ from: fromDateStr, to: toDateStr, timezone },
		{ model: data.model, tags: data.tags, search: data.search },
		{ promptId: data.promptId },
	);
	// coverageRate is a ratio in the shared analysis so the API can publish it
	// unrounded; the dashboard reads a percentage.
	return { ...analysis, coverageRate: Math.round(analysis.coverageRate * 100), model: data.model ?? null };
}
