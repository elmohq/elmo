import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { detectLanguage } from "@workspace/lib/markets/detect-language";
import { eq } from "drizzle-orm";

export type PromptLanguageDetector = (text: string, stored?: string | null) => Promise<string | null>;

/**
 * Detects the language of a brand's prompts as they are saved, since nobody
 * sets it by hand. Answers null for a prompt in the brand's own language, which
 * leaves it following the brand, and `stored` when the wording is too unclear
 * to say the prompt's language changed.
 */
export async function promptLanguageDetector(brandId: string): Promise<PromptLanguageDetector> {
	const [[brand], rivals] = await Promise.all([
		db
			.select({ name: brands.name, aliases: brands.aliases, language: brands.language })
			.from(brands)
			.where(eq(brands.id, brandId)),
		db
			.select({ name: competitors.name, aliases: competitors.aliases })
			.from(competitors)
			.where(eq(competitors.brandId, brandId)),
	]);
	if (!brand) return async () => null;

	const ignore = [brand, ...rivals].flatMap((company) => [company.name, ...company.aliases]);
	return async (text, stored = null) => {
		const language = await detectLanguage(text, ignore);
		if (language === null) return stored;
		return language === brand.language ? null : language;
	};
}
