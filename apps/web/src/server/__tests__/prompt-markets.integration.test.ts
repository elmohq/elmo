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

const idsIn = async (markets?: string) =>
	(await resolveFilteredPrompts(brandId, { markets })).map((prompt) => prompt.id).sort();

describe("filtering analytics by market", () => {
	it("counts a prompt that follows the brand under the brand's market", async () => {
		expect(await idsIn("de-DE")).toEqual([follows]);
	});

	it("counts a prompt with its own market under that market, not the brand's", async () => {
		expect(await idsIn("en-US")).toEqual([overrides]);
	});

	it("covers every enabled prompt with no market filter, or with one naming every market", async () => {
		const everything = [follows, overrides].sort();
		expect(await idsIn()).toEqual(everything);
		expect(await idsIn("de-DE,en-US")).toEqual(everything);
	});

	it("matches nothing for a market no prompt is asked in", async () => {
		expect(await idsIn("fr-FR")).toEqual([]);
	});
});

describe("listing prompts by market", () => {
	it("reports the market each prompt resolves to, beside what it sets itself", async () => {
		const { data } = await listPrompts({ brandId, limit: 10, offset: 0 });
		const byId = new Map(data.map((prompt) => [prompt.id, prompt]));

		expect(byId.get(follows)).toMatchObject({
			country: null,
			language: null,
			market: { country: "DE", language: "de" },
		});
		expect(byId.get(overrides)).toMatchObject({
			country: "US",
			language: "en",
			market: { country: "US", language: "en" },
		});
	});

	it("filters on the resolved market, disabled prompts included", async () => {
		const { data, total } = await listPrompts({ brandId, markets: "de-DE", limit: 10, offset: 0 });

		expect(total).toBe(2);
		expect(data.map((prompt) => prompt.id).sort()).toEqual([follows, disabled].sort());
	});
});
