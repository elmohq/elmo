import type { Market } from "@workspace/config/markets";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { detectLanguage } from "@workspace/lib/markets/detect-language";
import { type TranslatedPrompt, translatePrompts } from "@workspace/lib/markets/translate";
import { eq } from "drizzle-orm";

type PromptLanguageDetector = (text: string, stored?: string | null) => Promise<string | null>;

async function brandWording(brandId: string): Promise<{ language: string; names: string[] } | null> {
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
	if (!brand) return null;
	const names = [...new Set([brand, ...rivals].flatMap((company) => [company.name, ...company.aliases]))];
	return { language: brand.language, names };
}

function detectorFor(wording: { language: string; names: string[] }): PromptLanguageDetector {
	return async (text, stored = null) => {
		const language = await detectLanguage(text, wording.names);
		if (language === null) return stored;
		return language === wording.language ? null : language;
	};
}

/**
 * Detects the language of a brand's prompts as they are saved, since nobody
 * sets it by hand. Answers null for a prompt in the brand's own language, which
 * leaves it following the brand, and `stored` when the wording is too unclear
 * to say the prompt's language changed.
 */
export async function promptLanguageDetector(brandId: string): Promise<PromptLanguageDetector> {
	const wording = await brandWording(brandId);
	return wording ? detectorFor(wording) : async () => null;
}

/**
 * Wording for asking `texts` in a market: text already in the market's language
 * comes back as written, with no model call, and the rest is translated.
 * `languages` are what each text is saved under, for wording too unclear to detect.
 */
export async function draftPromptTranslations(
	brandId: string,
	market: Market,
	texts: string[],
	languages: readonly (string | null)[] = [],
): Promise<TranslatedPrompt[]> {
	const wording = await brandWording(brandId);
	if (!wording) throw new Error("Brand not found");

	const detect = detectorFor(wording);
	const written = await Promise.all(
		texts.map(async (text, index) => (await detect(text, languages[index])) ?? wording.language),
	);
	const foreign = texts.filter((_, index) => written[index] !== market.language);
	const translated =
		foreign.length > 0 ? await translatePrompts({ brandId, keepAsWritten: wording.names, texts: foreign, market }) : [];

	let next = 0;
	return texts.map((text, index) =>
		written[index] === market.language ? { source: text, translation: text } : translated[next++],
	);
}
