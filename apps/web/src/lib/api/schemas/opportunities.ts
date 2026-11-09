import * as z from "zod";

export const opportunityPromptSchema = z.object({
	text: z.string(),
	promptId: z.uuid().nullable(),
});

export const citedPageSchema = z.object({
	url: z.url(),
	domain: z.string(),
	title: z.string().nullable(),
});

export const opportunitySchema = z.object({
	category: z.enum(["creation", "existing-content", "outreach", "social"]),
	title: z.string(),
	why: z.string(),
	relatedPrompts: z.array(opportunityPromptSchema),
	yourCitations: z.array(citedPageSchema),
	competitorCitations: z.array(citedPageSchema),
});

export const brandOpportunitiesSchema = z.object({
	brandId: z.string(),
	status: z.enum(["ready", "insufficient-data"]),
	generatedAt: z.iso.datetime({ offset: true }).nullable(),
	model: z.string().nullable(),
	summary: z.array(z.string()),
	opportunities: z.array(opportunitySchema),
	risks: z.array(z.string()),
});
