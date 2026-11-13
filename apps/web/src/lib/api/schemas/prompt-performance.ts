import * as z from "zod";
import { dateRangeSchema } from "./date-range";
import { positionSchema } from "./position";
import { sentimentSummarySchema } from "./sentiment";

export const promptPerformanceSchema = z.object({
	promptId: z.uuid(),
	value: z.string(),
	tags: z.array(z.string()),
	totalRuns: z.int(),
	brandMentionRate: z.number().gte(0).lte(1),
	competitorMentionRate: z.number().gte(0).lte(1),
	lastRunAt: z.iso.datetime({ offset: true }).nullable(),
	firstEvaluatedAt: z.iso.datetime({ offset: true }).nullable(),
	sentiment: sentimentSummarySchema,
	position: positionSchema,
});

export const promptPerformanceListSchema = z.object({
	brandId: z.string(),
	range: dateRangeSchema,
	data: z.array(promptPerformanceSchema),
});
