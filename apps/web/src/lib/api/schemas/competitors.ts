import * as z from "zod";
import { paginationSchema } from "./pagination";

export const competitorSchema = z.object({
	id: z.uuid(),
	brandId: z.string(),
	name: z.string(),
	domains: z.array(z.string()),
	aliases: z.array(z.string()),
	createdAt: z.iso.datetime({ offset: true }),
	updatedAt: z.iso.datetime({ offset: true }),
});

export const competitorsListSchema = z.object({
	data: z.array(competitorSchema),
	competitors: z.array(competitorSchema),
	pagination: paginationSchema,
});
