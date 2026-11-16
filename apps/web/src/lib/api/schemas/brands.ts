import * as z from "zod";
import { paginationSchema } from "./pagination";

export const brandSchema = z.object({
	id: z.string(),
	name: z.string(),
	domains: z.array(z.string()),
	aliases: z.array(z.string()),
	enabled: z.boolean(),
	onboarded: z.boolean(),
	createdAt: z.iso.datetime({ offset: true }),
	updatedAt: z.iso.datetime({ offset: true }),
	organizationId: z.string(),
	enabledModels: z.array(z.string()).nullable(),
	delayOverrideHours: z.int().nullable(),
});

export const brandsListSchema = z.object({
	data: z.array(brandSchema),
	brands: z.array(brandSchema),
	pagination: paginationSchema,
});
