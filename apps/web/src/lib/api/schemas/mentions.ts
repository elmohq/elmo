import * as z from "zod";

export const mentionEntrySchema = z.object({
	entity: z.string(),
	count: z.int(),
});

export const mentionsSummarySchema = z.object({
	mentionsTotal: z.int(),
	brandMentionsTotal: z.int(),
	competitorMentionsTotal: z.int(),
	mentionsTopK: z.array(mentionEntrySchema),
});
