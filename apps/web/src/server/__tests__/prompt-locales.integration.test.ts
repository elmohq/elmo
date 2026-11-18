import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";
import { createPrompts, listPrompts, updatePrompt } from "@/server/prompts-core";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

vi.mock("@/lib/job-scheduler", () => ({
	createPromptJobScheduler: vi.fn(),
	removePromptJobScheduler: vi.fn(),
}));

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

describe("detecting a prompt's language on save", () => {
	const english = { id: "", name: "Acme", website: "https://acme.example", organizationId: "" };
	let englishBrandId: string;

	beforeAll(async () => {
		vi.stubEnv("DEPLOYMENT_MODE", "local");
		englishBrandId = await createBrand();
		english.id = englishBrandId;
		english.organizationId = englishBrandId;
	});

	afterAll(async () => {
		await deleteBrand(englishBrandId);
		vi.unstubAllEnvs();
	});

	it("stores the language of a prompt written in another one, and leaves the brand's own unset", async () => {
		const [german, plain] = await createPrompts(english, {
			prompts: [{ value: "bestes CRM für kleine Unternehmen" }, { value: "best crm for small business" }],
		});
		expect(german.language).toBe("de");
		expect(plain.language).toBeNull();
	});

	it("takes a language the caller names, or an explicit null, over what it would detect", async () => {
		const [named, followsBrand] = await createPrompts(english, {
			prompts: [
				{ value: "mejor crm para pequeñas empresas", language: "pt" },
				{ value: "meilleur CRM pour les petites entreprises", language: null },
			],
		});
		expect(named.language).toBe("pt");
		expect(followsBrand.language).toBeNull();
	});

	it("detects again when a prompt is reworded, and keeps what it had when the new wording is unclear", async () => {
		const [unset, spanish] = await createPrompts(english, {
			prompts: [{ value: "best crm for startups" }, { value: "top crm tools", language: "es" }],
		});

		const german = await updatePrompt(english, unset.id, {
			value: "beste CRM-Software für Gründer und Selbstständige",
		});
		expect(german.language).toBe("de");

		const backToEnglish = await updatePrompt(english, unset.id, {
			value: "what is the best crm software for founders and freelancers",
		});
		expect(backToEnglish.language).toBeNull();

		const unclear = await updatePrompt(english, spanish.id, { value: "hubspot pricing" });
		expect(unclear.language).toBe("es");

		const named = await updatePrompt(english, spanish.id, {
			value: "meilleur CRM pour les petites entreprises",
			language: "es",
		});
		expect(named.language).toBe("es");
	});
});
