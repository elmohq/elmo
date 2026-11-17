import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";
import { listPrompts } from "@/server/prompts-core";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

let brandId: string;
let follows: string;
let overrides: string;
let disabled: string;

beforeAll(async () => {
	brandId = await createBrand();
	await db.update(brands).set({ country: "DE", language: "de" }).where(eq(brands.id, brandId));
	const rows = await db
		.insert(prompts)
		.values([
			{ brandId, value: "bestes CRM" },
			{ brandId, value: "best crm", country: "US", language: "en" },
			{ brandId, value: "günstiges CRM", enabled: false },
		])
		.returning({ id: prompts.id });
	[follows, overrides, disabled] = rows.map((row) => row.id);
});

afterAll(async () => {
	await deleteBrand(brandId);
});

const idsIn = async (scope: { countries?: string; languages?: string } = {}) =>
	(await resolveFilteredPrompts(brandId, scope)).map((prompt) => prompt.id).sort();

describe("filtering analytics by country and language", () => {
	it("counts a prompt that follows the brand under the brand's country", async () => {
		expect(await idsIn({ countries: "DE" })).toEqual([follows]);
	});

	it("counts a prompt with its own country under that country, not the brand's", async () => {
		expect(await idsIn({ countries: "US" })).toEqual([overrides]);
	});

	it("filters by language on its own, whatever the country", async () => {
		expect(await idsIn({ languages: "en" })).toEqual([overrides]);
		expect(await idsIn({ languages: "de" })).toEqual([follows]);
	});

	it("needs a prompt to match both when a country and a language are filtered", async () => {
		expect(await idsIn({ countries: "DE", languages: "en" })).toEqual([]);
		expect(await idsIn({ countries: "US", languages: "en" })).toEqual([overrides]);
	});

	it("covers every enabled prompt with no filter, or with one naming every country", async () => {
		const everything = [follows, overrides].sort();
		expect(await idsIn()).toEqual(everything);
		expect(await idsIn({ countries: "DE,US" })).toEqual(everything);
	});

	it("matches nothing for a country no prompt is asked from", async () => {
		expect(await idsIn({ countries: "FR" })).toEqual([]);
	});
});

describe("listing prompts by country and language", () => {
	it("reports what each prompt resolves to, beside what it sets itself", async () => {
		const { data } = await listPrompts({ brandId, limit: 10, offset: 0 });
		const byId = new Map(data.map((prompt) => [prompt.id, prompt]));

		expect(byId.get(follows)).toMatchObject({
			country: null,
			language: null,
			effectiveCountry: "DE",
			effectiveLanguage: "de",
		});
		expect(byId.get(overrides)).toMatchObject({
			country: "US",
			language: "en",
			effectiveCountry: "US",
			effectiveLanguage: "en",
		});
	});

	it("filters on the resolved country, disabled prompts included", async () => {
		const { data, total } = await listPrompts({ brandId, countries: "DE", limit: 10, offset: 0 });

		expect(total).toBe(2);
		expect(data.map((prompt) => prompt.id).sort()).toEqual([follows, disabled].sort());
	});

	it("filters on the resolved language", async () => {
		const { data } = await listPrompts({ brandId, languages: "en", limit: 10, offset: 0 });
		expect(data.map((prompt) => prompt.id)).toEqual([overrides]);
	});
});
