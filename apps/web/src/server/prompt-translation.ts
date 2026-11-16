import { createServerFn } from "@tanstack/react-start";
import { countrySchema, languageSchema } from "@workspace/config/markets";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { translatePrompts } from "@workspace/lib/markets/translate";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";

/** Drafts only: nothing is tracked until the prompts editor saves what comes back. */
export const translatePromptsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string().min(1),
			market: z.object({ country: countrySchema, language: languageSchema }),
			texts: z.array(z.string().trim().min(1).max(2000)).min(1).max(MAX_PROMPTS),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		const [[brand], rivals] = await Promise.all([
			db.select({ name: brands.name, aliases: brands.aliases }).from(brands).where(eq(brands.id, data.brandId)),
			db
				.select({ name: competitors.name, aliases: competitors.aliases })
				.from(competitors)
				.where(eq(competitors.brandId, data.brandId)),
		]);
		if (!brand) throw new Error("Brand not found");

		return translatePrompts({
			brandId: data.brandId,
			keepAsWritten: [...new Set([brand, ...rivals].flatMap((company) => [company.name, ...company.aliases]))],
			texts: data.texts,
			market: data.market,
		});
	});
