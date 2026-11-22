import * as z from "zod";
import { paginationSchema } from "./pagination";

export const promptSchema = z.object({
	id: z.uuid(),
	brandId: z.string(),
	value: z.string(),
	enabled: z.boolean(),
	tags: z.array(z.string()),
	systemTags: z.array(z.string()),
	createdAt: z.iso.datetime({ offset: true }),
	updatedAt: z.iso.datetime({ offset: true }),
	premiumModels: z.array(z.string()),
});

export const promptListSchema = z.object({
	data: z.array(promptSchema),
	prompts: z.array(promptSchema),
	pagination: paginationSchema,
});

export const deletedPromptSchema = promptSchema.and(z.object({ deletedRunsCount: z.int() }));
