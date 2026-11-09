import * as z from "zod";
import { dateRangeSchema } from "./date-range";
import { paginationSchema } from "./pagination";

export const brandQueryFanoutSchema = z.object({
	brandId: z.string(),
	range: dateRangeSchema,
	totalQueries: z.int(),
	uniqueQueries: z.int(),
	fanoutRuns: z.int(),
	totalRuns: z.int(),
	avgQueriesPerRun: z.number(),
	coverageRate: z.number().gte(0).lte(1),
	data: z.array(
		z.object({
			query: z.string(),
			runs: z.int(),
			promptCount: z.int(),
		}),
	),
	pagination: paginationSchema,
});
