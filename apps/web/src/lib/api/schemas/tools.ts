import * as z from "zod";

export const onboardingSuggestionSchema = z.object({
	brandName: z.string(),
	website: z.string(),
	additionalDomains: z.array(z.string()),
	aliases: z.array(z.string()),
	competitors: z.array(
		z.object({
			name: z.string(),
			domains: z.array(z.string()),
			aliases: z.array(z.string()),
		}),
	),
	suggestedPrompts: z.array(
		z.object({
			prompt: z.string(),
			tags: z.array(z.string()),
		}),
	),
});
