import * as z from "zod";

export const tagSchema = z.object({
	name: z.string(),
	promptCount: z.int(),
	system: z.boolean(),
});

export const tagListSchema = z.object({
	brandId: z.string(),
	data: z.array(tagSchema),
});
