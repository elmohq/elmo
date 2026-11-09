import * as z from "zod";
import { mentionsSummarySchema } from "./mentions";
import { paginationSchema } from "./pagination";

const reportStatusSchema = z.enum(["pending", "processing", "completed", "failed"]);

const ratioSchema = z.number().min(0).max(1);

export const reportSummarySchema = z.object({
	id: z.uuid(),
	brandName: z.string(),
	brandAliases: z.array(z.string()),
	brandWebsite: z.string(),
	status: reportStatusSchema,
	createdAt: z.iso.datetime({ offset: true }),
	completedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const reportListSchema = z.object({
	data: z.array(reportSummarySchema),
	reports: z.array(reportSummarySchema),
	pagination: paginationSchema,
});

export const createdReportSchema = z.object({
	reportId: z.uuid(),
	status: z.enum(["pending"]),
	brandName: z.string(),
	brandAliases: z.array(z.string()),
	brandWebsite: z.string(),
	createdAt: z.iso.datetime({ offset: true }),
});

export const reportPromptSnapshotSchema = z.object({
	promptValue: z.string(),
	totalRuns: z.int(),
	mentions: mentionsSummarySchema,
});

export const reportSchema = z.object({
	reportId: z.uuid(),
	status: reportStatusSchema,
	progress: z.int().optional(),
	brandName: z.string(),
	brandAliases: z.array(z.string()),
	brandWebsite: z.string(),
	createdAt: z.iso.datetime({ offset: true }),
	completedAt: z.iso.datetime({ offset: true }).nullable(),
	prompts: z.array(reportPromptSnapshotSchema).optional(),
	unstable: z
		.object({
			sov: ratioSchema.nullish(),
			visibility: ratioSchema.optional(),
			totalPrompts: z.int().optional(),
			totalPromptRuns: z.int().optional(),
			promptsWithBrandMentions: z.int().optional(),
			promptRunsWithBrandMentions: z.int().optional(),
			competitors: z
				.array(
					z.object({
						name: z.string(),
						sov: ratioSchema,
						visibility: ratioSchema,
						promptsWithMentions: z.int(),
						promptRunsWithMentions: z.int(),
					}),
				)
				.optional(),
		})
		.optional(),
});
