import * as z from "zod";
import { dateRangeSchema } from "./date-range";
import { positionSchema } from "./position";
import { sentimentSummarySchema } from "./sentiment";

export const visibilityPointSchema = z.object({
	date: z.iso.date(),
	visibility: z.number().gte(0).lte(1).nullable(),
});

export const shareOfVoiceEntrySchema = z.object({
	name: z.string(),
	isBrand: z.boolean(),
	mentions: z.int(),
	prompts: z.int(),
	share: z.number().gte(0).lte(1),
	sentiment: sentimentSummarySchema,
	position: positionSchema,
});

export const shareOfVoicePointSchema = z.object({
	date: z.iso.date(),
	share: z.number().gte(0).lte(1).nullable(),
});

export const modelVisibilitySchema = z.object({
	model: z.string(),
	label: z.string(),
	runs: z.int(),
	brandMentions: z.int(),
	visibility: z.number().gte(0).lte(1).nullable(),
	citations: z.int(),
	sentiment: sentimentSummarySchema,
	position: positionSchema,
});

export const brandSentimentSchema = z.object({
	...sentimentSummarySchema.shape,
	series: z.array(
		z.object({
			date: z.iso.date(),
			positive: z.int().gte(0),
			neutral: z.int().gte(0),
			negative: z.int().gte(0),
			mixed: z.int().gte(0),
		}),
	),
});

export const brandPositionSchema = z.object({
	average: z.number().gte(1).nullable(),
	series: z.array(
		z.object({
			date: z.iso.date(),
			average: z.number().gte(1).nullable(),
		}),
	),
});

export const brandAnalyticsSchema = z.object({
	brandId: z.string(),
	brandName: z.string(),
	range: dateRangeSchema,
	visibility: z.object({
		current: z.number().gte(0).lte(1).nullable(),
		series: z.array(visibilityPointSchema),
	}),
	shareOfVoice: z.object({
		brand: z.number().gte(0).lte(1).nullable(),
		entries: z.array(shareOfVoiceEntrySchema),
		series: z.array(shareOfVoicePointSchema),
	}),
	models: z.array(modelVisibilitySchema),
	totals: z.object({
		runs: z.int(),
		prompts: z.int(),
		citations: z.int(),
		uniqueDomains: z.int(),
		uniqueUrls: z.int(),
	}),
	sentiment: brandSentimentSchema,
	position: brandPositionSchema,
});
