/**
 * Translates prompts into a market's language once and remembers what the model
 * returned, so asking again for the same text is free. A translation is only a
 * draft: it becomes an ordinary prompt the user edits and saves.
 */
import { createHash } from "node:crypto";
import { countryName, describeLanguageForMarket, type Market, marketId } from "@workspace/config/markets";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { promptTranslations } from "../db/schema";
import { resolveResearchProvider } from "../onboarding/llm";

/** Models translate a long numbered list less reliably, and one bad batch loses less. */
const BATCH_SIZE = 25;

/** New translations a brand may request in a day, far above any real edit session. */
export const DAILY_TRANSLATION_LIMIT = 500;

export class TranslationLimitError extends Error {
	constructor() {
		super(`This brand has reached today's limit of ${DAILY_TRANSLATION_LIMIT} new translations. Try again tomorrow.`);
		this.name = "TranslationLimitError";
	}
}

export interface TranslatePromptsInput {
	brandId: string;
	/** Names the translator must leave as written. */
	keepAsWritten: string[];
	texts: string[];
	market: Market;
}

export interface TranslatedPrompt {
	source: string;
	translation: string;
}

const translationsSchema = z.object({
	translations: z
		.array(z.string())
		.describe("One translation per numbered prompt, in the same order, with no numbering."),
});

/** Whitespace-insensitive, so a prompt re-pasted from a wrapped document finds its translation. */
function sourceHash(text: string): string {
	return createHash("sha256").update(text.trim().replace(/\s+/g, " ")).digest("hex");
}

function buildTranslationPrompt(texts: string[], market: Market, keepAsWritten: string[]): string {
	const names = keepAsWritten.filter(Boolean);
	const keep =
		names.length > 0 ? `\nLeave these names exactly as written, whatever the language: ${names.join(", ")}.` : "";
	return `Translate each prompt below into ${describeLanguageForMarket(market)}.

Each one is a question a person types into an AI assistant such as ChatGPT. Phrase it the way someone in ${countryName(market.country)} would naturally ask it rather than word for word, and keep its meaning, length, and tone. Do not answer the question, and do not add or drop details.${keep}

${texts.map((text, index) => `${index + 1}. ${text}`).join("\n")}`;
}

async function translateBatch(texts: string[], market: Market, keepAsWritten: string[]) {
	const provider = resolveResearchProvider();
	// The stub answers every call with one canned object, which can't hold a translation per input.
	if (provider.id === "stub") {
		return { translations: texts.map((text) => `${text} (${marketId(market)})`), model: "stub" };
	}
	if (!provider.runStructuredResearch) {
		throw new Error(`Provider "${provider.id}" does not implement structured research`);
	}
	const result = await provider.runStructuredResearch({
		prompt: buildTranslationPrompt(texts, market, keepAsWritten),
		schema: translationsSchema,
		webSearch: false,
	});
	const translations = result.object.translations.map((translation) => translation.trim());
	if (translations.length !== texts.length || translations.some((translation) => !translation)) {
		throw new Error(`The model returned ${translations.length} translations for ${texts.length} prompts.`);
	}
	return { translations, model: result.modelVersion ?? provider.id };
}

async function newTranslationsToday(brandId: string): Promise<number> {
	const [row] = await db
		.select({ value: sql<number>`count(*)::int` })
		.from(promptTranslations)
		.where(
			and(eq(promptTranslations.brandId, brandId), gt(promptTranslations.createdAt, sql`now() - interval '24 hours'`)),
		);
	return row?.value ?? 0;
}

/** Returned in the order asked, one per input text. */
export async function translatePrompts(input: TranslatePromptsInput): Promise<TranslatedPrompt[]> {
	const market = marketId(input.market);
	const sources = input.texts.map((text) => text.trim());
	const hashes = sources.map(sourceHash);
	if (sources.length === 0) return [];

	const stored = await db
		.select({ sourceHash: promptTranslations.sourceHash, translation: promptTranslations.translation })
		.from(promptTranslations)
		.where(
			and(
				eq(promptTranslations.brandId, input.brandId),
				eq(promptTranslations.market, market),
				inArray(promptTranslations.sourceHash, [...new Set(hashes)]),
			),
		);
	const known = new Map(stored.map((row) => [row.sourceHash, row.translation]));

	const missing = [...new Map(sources.map((text, index) => [hashes[index], text])).entries()].filter(
		([hash]) => !known.has(hash),
	);
	if (missing.length > 0 && (await newTranslationsToday(input.brandId)) + missing.length > DAILY_TRANSLATION_LIMIT) {
		throw new TranslationLimitError();
	}

	for (let start = 0; start < missing.length; start += BATCH_SIZE) {
		const batch = missing.slice(start, start + BATCH_SIZE);
		const { translations, model } = await translateBatch(
			batch.map(([, text]) => text),
			input.market,
			input.keepAsWritten,
		);
		// Saved batch by batch, so a later batch failing doesn't throw away what was already paid for.
		await db
			.insert(promptTranslations)
			.values(
				batch.map(([hash], index) => ({
					brandId: input.brandId,
					market,
					sourceHash: hash,
					translation: translations[index],
					model,
				})),
			)
			.onConflictDoNothing();
		batch.forEach(([hash], index) => {
			known.set(hash, translations[index]);
		});
	}

	return sources.map((source, index) => ({ source, translation: known.get(hashes[index]) ?? source }));
}
