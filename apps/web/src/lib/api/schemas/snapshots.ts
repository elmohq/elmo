import * as z from "zod";
import { mentionsSummarySchema } from "./mentions";
import { positionSchema } from "./position";
import { sentimentSummarySchema } from "./sentiment";

export const citedUrlEntrySchema = z.object({
	url: z.string(),
	title: z.string().nullable(),
	count: z.int(),
});

export const promptSnapshotSchema = z.object({
	brandId: z.string(),
	promptId: z.uuid(),
	promptValue: z.string(),
	startDate: z.iso.date(),
	endDate: z.iso.date(),
	mentions: mentionsSummarySchema,
	citations: z.object({
		citationsTotal: z.int(),
		brandCitationsTotal: z.int(),
		competitorCitationsTotal: z.int(),
		citedUrlsTopK: z.array(citedUrlEntrySchema),
	}),
	sentiment: sentimentSummarySchema,
	position: positionSchema,
});
