import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { detectPromptLanguage } from "@workspace/lib/markets/detect-language";
import { eq } from "drizzle-orm";

/**
 * Detects the language of a brand's prompts as they are saved, so a prompt
 * written in another language doesn't need it set by hand. Answers null for a
 * prompt in the brand's own language, which leaves it following the brand.
 */
export async function promptLanguageDetector(brandId: string): Promise<(text: string) => Promise<string | null>> {
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
	return (text) => detectPromptLanguage(text, { brandLanguage: brand.language, ignore });
}
