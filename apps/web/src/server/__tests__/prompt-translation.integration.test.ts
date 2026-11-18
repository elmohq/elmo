import { db } from "@workspace/lib/db/db";
import { promptTranslations } from "@workspace/lib/db/schema";
import { DAILY_TRANSLATION_LIMIT, TranslationLimitError, translatePrompts } from "@workspace/lib/markets/translate";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { draftPromptTranslations } from "@/server/prompt-language";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

const germany = { country: "DE", language: "de" };
const france = { country: "FR", language: "fr" };

let brandId: string;

beforeAll(async () => {
	// The stub translator marks each text with its market, which stands in for a model here.
	vi.stubEnv("ONBOARDING_LLM_TARGET", "stub:stub");
	brandId = await createBrand();
});

afterAll(async () => {
	await deleteBrand(brandId);
	vi.unstubAllEnvs();
});

const translate = (texts: string[], market = germany) =>
	translatePrompts({ brandId, keepAsWritten: ["Acme"], texts, market });

const storedFor = () => db.select().from(promptTranslations).where(eq(promptTranslations.brandId, brandId));

describe("translatePrompts", () => {
	it("returns one translation per prompt, in the order asked", async () => {
		const result = await translate(["best crm", "cheapest crm"]);
		expect(result).toEqual([
			{ source: "best crm", translation: "best crm (de-DE)" },
			{ source: "cheapest crm", translation: "cheapest crm (de-DE)" },
		]);
	});

	it("answers a prompt it has translated before from what it stored, without asking again", async () => {
		await translate(["which crm is easiest"]);
		await db
			.update(promptTranslations)
			.set({ translation: "the stored translation" })
			.where(eq(promptTranslations.translation, "which crm is easiest (de-DE)"));

		const [again] = await translate(["  which   crm is easiest "]);
		expect(again.translation).toBe("the stored translation");
	});

	it("translates a prompt repeated in one request once", async () => {
		const before = (await storedFor()).length;
		const result = await translate(["top crm tools", "top crm tools"]);

		expect(result.map((entry) => entry.translation)).toEqual(["top crm tools (de-DE)", "top crm tools (de-DE)"]);
		expect((await storedFor()).length).toBe(before + 1);
	});

	it("keeps each market's translation of the same prompt apart", async () => {
		const [german] = await translate(["crm for startups"], germany);
		const [french] = await translate(["crm for startups"], france);

		expect(german.translation).toBe("crm for startups (de-DE)");
		expect(french.translation).toBe("crm for startups (fr-FR)");
	});

	it("refuses new translations past the daily limit", async () => {
		const limited = await createBrand();
		try {
			await db.insert(promptTranslations).values(
				Array.from({ length: DAILY_TRANSLATION_LIMIT }, (_, index) => ({
					brandId: limited,
					market: "de-DE",
					sourceHash: `filler-${index}`,
					translation: "filler",
				})),
			);
			const request = (texts: string[]) =>
				translatePrompts({ brandId: limited, keepAsWritten: [], texts, market: france });

			await expect(request(["one more"])).rejects.toBeInstanceOf(TranslationLimitError);
		} finally {
			await deleteBrand(limited);
		}
	});
});

describe("drafting a prompt for another country", () => {
	it("translates a prompt written in another language and leaves one already in the market's language as written", async () => {
		const [english, german] = await draftPromptTranslations(brandId, germany, [
			"what is the best crm for a small business",
			"bestes CRM für kleine Unternehmen",
		]);
		expect(english.translation).not.toBe("what is the best crm for a small business");
		expect(german.translation).toBe("bestes CRM für kleine Unternehmen");
	});

	it("goes by the language a prompt is saved under when its wording is too short to tell", async () => {
		const [saved] = await draftPromptTranslations(brandId, france, ["Acme pricing"], ["fr"]);
		expect(saved.translation).toBe("Acme pricing");

		const [unsaved] = await draftPromptTranslations(brandId, france, ["Acme pricing"], [null]);
		expect(unsaved.translation).not.toBe("Acme pricing");
	});
});
