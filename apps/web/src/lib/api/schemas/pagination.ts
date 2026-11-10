import * as z from "zod";

export const paginationSchema = z.object({
	page: z.int(),
	limit: z.int(),
	total: z.int(),
	totalPages: z.int(),
});
