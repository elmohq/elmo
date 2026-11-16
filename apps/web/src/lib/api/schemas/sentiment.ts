import * as z from "zod";

export const sentimentSummarySchema = z.object({
	positive: z.int().gte(0),
	neutral: z.int().gte(0),
	negative: z.int().gte(0),
	mixed: z.int().gte(0),
	score: z.number().gte(0).lte(1).nullable(),
});
