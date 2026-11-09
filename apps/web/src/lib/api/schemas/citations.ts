import { CITATION_CATEGORIES, CITATION_PAGE_TYPES } from "@workspace/lib/citations/domain-categories";
import * as z from "zod";
import { dateRangeSchema } from "./date-range";
import { paginationSchema } from "./pagination";

const citationCategorySchema = z.enum(CITATION_CATEGORIES);

const citationTotalsSchema = z.object({
	citations: z.int(),
	uniqueDomains: z.int(),
	uniqueUrls: z.int(),
});

export const citationDomainListSchema = z.object({
	brandId: z.string(),
	range: dateRangeSchema,
	totals: citationTotalsSchema,
	data: z.array(
		z.object({
			domain: z.string(),
			category: citationCategorySchema,
			count: z.int(),
			share: z.number().gte(0).lte(1),
			promptCount: z.int(),
			previousCount: z.int(),
			changeFactor: z.number().gte(0).nullable(),
		}),
	),
	pagination: paginationSchema,
});

export const citationUrlListSchema = z.object({
	brandId: z.string(),
	range: dateRangeSchema,
	totals: citationTotalsSchema,
	data: z.array(
		z.object({
			url: z.url(),
			domain: z.string(),
			title: z.string().nullable(),
			category: citationCategorySchema,
			pageType: z.enum(CITATION_PAGE_TYPES),
			count: z.int(),
			promptCount: z.int(),
			isNew: z.boolean(),
		}),
	),
	pagination: paginationSchema,
});
