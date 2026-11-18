import { createServerFn } from "@tanstack/react-start";
import { countrySchema, languageSchema } from "@workspace/config/markets";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { draftPromptTranslations } from "@/server/prompt-language";

/** Drafts only: nothing is tracked until the prompts editor saves what comes back. */
export const translatePromptsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string().min(1),
			market: z.object({ country: countrySchema, language: languageSchema }),
			texts: z.array(z.string().trim().min(1).max(2000)).min(1).max(MAX_PROMPTS),
			/** The language each text is saved under, if any, for wording too unclear to detect. */
			languages: z.array(languageSchema.nullable()).max(MAX_PROMPTS).optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		return draftPromptTranslations(data.brandId, data.market, data.texts, data.languages);
	});
