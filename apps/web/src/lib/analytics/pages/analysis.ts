import { z } from "zod";
import { resolveBrandWindow } from "@/lib/analytics/brand-window";
import {
	type BrandSentiment,
	getBrandSentiment,
	getBrandShareOfVoice,
	getCompetitiveLandscape,
} from "@/lib/analytics/core";
import type { Landscape } from "@/lib/landscape";
import { lookbackSchema } from "@/lib/lookback";

export interface ShareOfVoiceEntry {
	name: string;
	mentions: number;
	share: number;
	isBrand: boolean;
	/** Distinct prompts the entity appeared in. */
	prompts: number;
}

export interface ShareOfVoiceResponse {
	brandName: string;
	entries: ShareOfVoiceEntry[];
	brandShare: number | null;
	totalRuns: number;
	model: string | null;
}

export const shareOfVoiceInput = z.object({
	brandId: z.string(),
	lookback: lookbackSchema.default("1m"),
	model: z.string().optional(),
	tags: z.string().optional(),
	search: z.string().optional(),
	timezone: z.string().default("UTC"),
});

export async function computeShareOfVoice(input: z.input<typeof shareOfVoiceInput>): Promise<ShareOfVoiceResponse> {
	const data = shareOfVoiceInput.parse(input);
	const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(data.brandId, data.lookback, data.timezone);
	const result = await getBrandShareOfVoice(
		data.brandId,
		{ from: fromDateStr, to: toDateStr, timezone },
		{ model: data.model, tags: data.tags, search: data.search },
	);
	return {
		brandName: result.brandName,
		brandShare: result.brandShare,
		totalRuns: result.totalRuns,
		model: data.model ?? null,
		entries: result.entries,
	};
}

export const landscapeInput = z.object({
	brandId: z.string(),
	lookback: lookbackSchema.default("1m"),
	model: z.string().optional(),
	tags: z.string().optional(),
	timezone: z.string().default("UTC"),
});

export async function computeLandscape(input: z.input<typeof landscapeInput>): Promise<Landscape> {
	const data = landscapeInput.parse(input);
	const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(data.brandId, data.lookback, data.timezone);
	return getCompetitiveLandscape(
		data.brandId,
		{ from: fromDateStr, to: toDateStr, timezone },
		{ model: data.model, tags: data.tags },
	);
}

export const brandSentimentInput = landscapeInput;

export async function computeBrandSentiment(input: z.input<typeof brandSentimentInput>): Promise<BrandSentiment> {
	const data = brandSentimentInput.parse(input);
	const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(data.brandId, data.lookback, data.timezone);
	return getBrandSentiment(
		data.brandId,
		{ from: fromDateStr, to: toDateStr, timezone },
		{ model: data.model, tags: data.tags },
	);
}
