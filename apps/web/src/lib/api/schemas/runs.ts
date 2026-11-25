import * as z from "zod";
import { paginationSchema } from "./pagination";

export const mentionAssessmentSchema = z.object({
	mentioned: z.boolean(),
	probability: z.number().min(0).max(1),
	reason: z.string().nullable(),
	sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).nullable(),
	sentimentProbabilities: z.record(z.string(), z.number().min(0).max(1)).nullable(),
	position: z.int().min(1).nullable(),
	mentionCount: z.int().min(1).nullable(),
});

export const runAssessmentsSchema = z
	.object({
		brand: mentionAssessmentSchema.nullable(),
		competitors: z.record(z.string(), mentionAssessmentSchema),
	})
	.nullable();

export const runSummarySchema = z.object({
	id: z.uuid(),
	promptId: z.uuid(),
	brandId: z.string(),
	model: z.string(),
	provider: z.string().nullable(),
	webSearchEnabled: z.boolean(),
	brandMentioned: z.boolean(),
	competitorsMentioned: z.array(z.string()),
	assessments: runAssessmentsSchema,
	webQueries: z.array(z.string()),
	citationCount: z.int(),
	createdAt: z.iso.datetime({ offset: true }),
});

export const runCitationSchema = z.object({
	url: z.url(),
	domain: z.string(),
	title: z.string().nullable(),
	citationIndex: z.int(),
});

export const runSchema = runSummarySchema.and(
	z.object({
		answer: z.object({ text: z.string().nullable() }),
		citations: z.array(runCitationSchema),
	}),
);

export const runListSchema = z.object({
	data: z.array(runSummarySchema),
	pagination: paginationSchema,
});
