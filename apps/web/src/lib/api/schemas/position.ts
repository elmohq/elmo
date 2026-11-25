import * as z from "zod";

export const positionSchema = z.object({
	average: z.number().gte(1).nullable(),
});
