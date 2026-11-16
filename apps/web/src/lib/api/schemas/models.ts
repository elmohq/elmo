import * as z from "zod";

export const modelSchema = z.object({
	id: z.string(),
	label: z.string(),
	premiumCapable: z.boolean(),
	configured: z.boolean(),
});

export const modelListSchema = z.object({
	data: z.array(modelSchema),
});
