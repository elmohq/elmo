import * as z from "zod";

export const dateRangeSchema = z.object({
	start: z.iso.datetime({ offset: true }),
	end: z.iso.datetime({ offset: true }),
});
